// Copyright (c) 2024–2026 Vinili & Caffè. Tutti i diritti riservati.
// Uso, copia, modifica e distribuzione vietati — vedi ../../LICENSE.
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
import { buildWikiCommandPanesInnerHtml } from "./wiki-command-discovery.mjs";
import { loadGaleoniEconomyUnlockMs } from "./wiki-help-visibility.mjs";
import { minifyHtmlFilesInDist, obfuscateProjectJsInDist } from "./minify-obfuscate-dist.mjs";
import { fetchStaffListStatusFlags } from "./staff-list-status.mjs";
import { fetchCommunityPulse } from "./live-community-pulse.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const CONFIG_PATH = path.join(ROOT, "site.config.json");
const botIds = require(path.join(ROOT, "..", "Vinyls", "Utils", "Config", "ids.js"));
const FALLBACK_GUILD_ICON = "images/vc-header-logo.png";
/** Discord snowflake epoch (2015-01-01 UTC), ms since Unix epoch. */
const DISCORD_EPOCH_MS = 1420070400000;

function envFlagTrue(name) {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Log informativi build (OAuth, override env, ecc.); disattiva con VC_BUILD_QUIET=1. */
function buildInfoLog(...args) {
  if (envFlagTrue("VC_BUILD_QUIET")) return;
  console.log(...args);
}

const STAFF_LIST_FALLBACK_HTML = `          <p>
            L&apos;organico dello staff, i permessi e i canali dedicati sono gestiti sul server Discord. Per segnalazioni o partnership
            usa i contatti qui sotto o i ticket indicati nelle regole del server.
          </p>`;

const EXCLUDE = new Set([
  "dist",
  "scripts",
  "deploy-site.ps1",
  "site.config.json",
  "Dockerfile",
  "docker-compose.yml",
  ".dockerignore",
  "package.json",
  "package-lock.json",
  "README.md",
  "CNAME",
  "node_modules",
  "deploy",
]);

function rmrf(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    return;
  } catch {
    rmrfContentsExceptLockedLarge(dir);
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch { /* */ }
  }
}

const LARGE_ASSET_MIN_BYTES = 40 * 1024 * 1024;

function rmrfContentsExceptLockedLarge(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      rmrfContentsExceptLockedLarge(p);
      try {
        if (fs.readdirSync(p).length === 0) fs.rmdirSync(p);
      } catch { /* */ }
    } else {
      try {
        fs.unlinkSync(p);
      } catch (err) {
        if (st.size >= LARGE_ASSET_MIN_BYTES) {
          console.warn(`[build-site] File grande in uso, mantengo: ${path.relative(ROOT, p)}`);
        } else {
          throw err;
        }
      }
    }
  }
}

function copyRecursive(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    if (EXCLUDE.has(name)) continue;
    const src = path.join(srcDir, name);
    const dst = path.join(dstDir, name);
    const st = fs.statSync(src);
    if (st.isDirectory()) copyRecursive(src, dst);
    else {
      if (st.size >= LARGE_ASSET_MIN_BYTES && fs.existsSync(dst)) {
        try {
          const dstSt = fs.statSync(dst);
          if (dstSt.size === st.size) continue;
        } catch { /* ricopia */ }
      }
      fs.copyFileSync(src, dst);
    }
  }
}

function applyForbiddenBooksScheduleToDist(distDir) {
  const vinylsConfigPath = path.join(ROOT, "..", "Vinyls", "config.json");
  if (!fs.existsSync(vinylsConfigPath)) return;
  let vinylsCfg;
  try {
    vinylsCfg = readJson(vinylsConfigPath);
  } catch {
    return;
  }
  const { resolveForbiddenBooksSchedule } = require(path.join(ROOT, "..", "Vinyls", "Utils", "Web", "hogwartsEventSchedule.js"));
  const { startMs, endMs } = resolveForbiddenBooksSchedule(vinylsCfg);
  const landingPath = path.join(distDir, "js", "vc-landing.js");
  if (!fs.existsSync(landingPath) || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
  let js = fs.readFileSync(landingPath, "utf8");
  js = js.replace(/var FORBIDDEN_BOOKS_START_MS = [^;]+;/g, `var FORBIDDEN_BOOKS_START_MS = ${startMs};`);
  js = js.replace(/var FORBIDDEN_BOOKS_END_MS = [^;]+;/g, `var FORBIDDEN_BOOKS_END_MS = ${endMs};`);
  fs.writeFileSync(landingPath, js, "utf8");
}

function readJson(p) {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function escAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSponsorPromoUntilLabel(iso) {
  const raw = String(iso || "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "Europe/Rome" });
  return `fino al ${day}`;
}

function buildPremiumFooterTemplate() {
  return `
  <footer class="vc-premium-footer" aria-label="Footer" data-i18n-attr="aria-label:footer.aria">
    <div class="vc-premium-footer__card">
      <div class="vc-premium-footer__outer">
        <div class="vc-premium-footer__inner">
          <div class="vc-premium-footer__grid">
            <section class="vc-premium-footer__brand" aria-label="{{SITE_NAME}}">
              <a class="vc-premium-footer__logo-row" href="{{SITE_URL}}">
                <span class="vc-premium-footer__logo" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 20C4 20 4 14 10 10C16 6 20 4 20 4C20 4 18 8 14 14C10 20 4 20 4 20Z" fill="white" />
                    <path d="M4 20L10 14" stroke="white" stroke-width="2" stroke-linecap="round" />
                  </svg>
                </span>
                <span class="vc-premium-footer__wordmark">{{SITE_NAME}}</span>
              </a>
              <p class="vc-premium-footer__desc" data-i18n="footer.desc">Community italiana Discord curata nei dettagli: musica, socialità, ruoli personalizzati, eventi e strumenti sviluppati su misura.</p>
              <div class="vc-premium-footer__socials" aria-label="Social" data-i18n-attr="aria-label:footer.social">
                <a class="vc-premium-footer__social" href="{{INSTAGRAM_URL}}" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16.8" cy="7.2" r="1.1" fill="currentColor"/></svg>
                </a>
                <a class="vc-premium-footer__social" href="{{DISCORD_INVITE_URL}}" target="_blank" rel="noopener noreferrer" aria-label="Discord">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 5.4A17 17 0 0 0 15.2 4l-.2.4a13 13 0 0 1 3.2 1.6 10.8 10.8 0 0 0-4-1.2 11.2 11.2 0 0 0-4.4.2A10.8 10.8 0 0 0 5.8 6a13 13 0 0 1 3.3-1.6L8.9 4a17 17 0 0 0-4.4 1.4C1.8 9.4 1 13.3 1.4 17.2A17 17 0 0 0 6.6 20l1.1-1.5c-.6-.2-1.2-.5-1.8-.9l.4-.3c3.4 1.6 7.2 1.6 10.6 0l.4.3c-.6.4-1.2.7-1.8.9l1.1 1.5a17 17 0 0 0 5.2-2.8c.5-4.5-.8-8.4-2.3-11.8ZM8.8 15.1c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.4 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" fill="currentColor"/></svg>
                </a>
                <a class="vc-premium-footer__social" href="{{TIKTOK_URL}}" target="_blank" rel="noopener noreferrer" aria-label="TikTok">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4v9.1a4.4 4.4 0 1 1-4.4-4.4c.35 0 .7.04 1.03.12v2.55a1.9 1.9 0 1 0 1.03 1.68V4h2.34Zm0 0c.4 2.15 1.74 3.43 3.7 3.84v2.42c-1.52-.08-2.8-.56-3.7-1.36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </a>
              </div>
            </section>
            <nav class="vc-premium-footer__col" aria-label="Community" data-i18n-attr="aria-label:footer.community">
              <h4 data-i18n="footer.community">Community</h4>
              <ul>
                <li><a href="{{SITE_URL}}" data-i18n="footer.home">Home</a></li>
                <li><a href="{{USER_PAGE_URL}}" data-i18n="footer.users">Users</a></li>
                <li><a href="{{RUOLI_PAGE_URL}}" data-i18n="footer.roles">Ruoli</a></li>
              </ul>
            </nav>
            <nav class="vc-premium-footer__col" aria-label="Scopri" data-i18n-attr="aria-label:footer.discover">
              <h4 data-i18n="footer.discover">Scopri</h4>
              <ul>
                <li><a href="{{WIKI_URL}}" data-i18n="footer.wiki">Wiki</a></li>
                <li><a href="{{COMMUNITY_RULES_URL}}" data-i18n="footer.rules">Regole</a></li>
                <li><a href="{{FAQ_URL}}" data-i18n="footer.faq">FAQ</a></li>
                <li><a href="{{SPONSOR_URL}}" data-i18n="footer.sponsor">Sponsor</a></li>
              </ul>
            </nav>
            <nav class="vc-premium-footer__col" aria-label="Supporta" data-i18n-attr="aria-label:footer.support">
              <h4 data-i18n="footer.support">Supporta</h4>
              <ul>
                <li><a href="{{PERKS_URL}}" data-i18n="footer.perks">Perks</a></li>
                <li><a href="{{VOTE_URL}}" data-i18n="footer.vote">Vota</a></li>
                <li><a href="{{REVIEWS_PAGE_URL}}" data-i18n="footer.reviews">Recensioni</a></li>
                <li><a href="{{DONATIONS_URL}}" data-i18n="footer.donations">Donazioni</a></li>
              </ul>
            </nav>
            <nav class="vc-premium-footer__col" aria-label="Richieste" data-i18n-attr="aria-label:footer.requests">
              <h4 data-i18n="footer.requests">Richieste</h4>
              <ul>
                <li><a href="{{RICHIESTE_UNBAN_URL}}" data-i18n="footer.appeals">Appelli</a></li>
                <li><a href="{{RICHIESTE_CANDIDATURE_URL}}" data-i18n="footer.applications">Candidature</a></li>
                <li><a href="{{RICHIESTE_SUGGERIMENTI_URL}}" data-i18n="footer.suggestions">Suggerimenti</a></li>
                <li><a href="{{TICKETS_PAGE_URL}}" data-i18n="footer.tickets">Tickets</a></li>
              </ul>
            </nav>
          </div>
        </div>
        <div class="vc-premium-footer__legal">
          <p><a class="vc-footer-copy-link" href="{{COPYRIGHT_URL}}">© {{YEAR}} {{SITE_NAME}}. All rights reserved.</a></p>
          <nav aria-label="Link legali" data-i18n-attr="aria-label:footer.legalLinks">
            <a href="{{TERMS_URL}}" data-i18n="footer.terms">Termini di Servizio</a>
            <span aria-hidden="true"></span>
            <a href="{{PRIVACY_URL}}" data-i18n="footer.privacy">Privacy Policy</a>
            <span aria-hidden="true"></span>
            <a href="{{COOKIE_POLICY_URL}}" data-i18n="footer.cookies">Cookie Policy</a>
          </nav>
        </div>
      </div>
    </div>
  </footer>`;
}

/** Footer dashboard: stesso look del sito, senza colonne/link community. */
function buildDashboardFooterTemplate() {
  return `
  <footer class="vc-premium-footer vc-premium-footer--dashboard" aria-label="Footer dashboard" data-i18n-attr="aria-label:footer.aria">
    <div class="vc-premium-footer__card">
      <div class="vc-premium-footer__outer">
        <div class="vc-premium-footer__inner">
          <div class="vc-premium-footer__grid vc-premium-footer__grid--dashboard">
            <section class="vc-premium-footer__brand" aria-label="{{SITE_NAME}}">
              <a class="vc-premium-footer__logo-row" href="{{SITE_URL}}">
                <span class="vc-premium-footer__logo" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 20C4 20 4 14 10 10C16 6 20 4 20 4C20 4 18 8 14 14C10 20 4 20 4 20Z" fill="white" />
                    <path d="M4 20L10 14" stroke="white" stroke-width="2" stroke-linecap="round" />
                  </svg>
                </span>
                <span class="vc-premium-footer__wordmark">{{SITE_NAME}}</span>
              </a>
              <p class="vc-premium-footer__desc" data-i18n="footer.dashboardDesc">Da qui configuri Vinili sui tuoi server: identità e prefisso, accesso alla dashboard, partnership, avvisi e le altre impostazioni del bot.</p>
            </section>
            <nav class="vc-premium-footer__col" aria-label="Dashboard" data-i18n-attr="aria-label:footer.dashboard">
              <h4 data-i18n="footer.dashboard">Dashboard</h4>
              <ul>
                <li><a href="{{DASHBOARD_PAGE_URL}}" data-i18n="footer.yourServers">I tuoi server</a></li>
                <li><a href="{{DASHBOARD_PROFILE_PAGE_URL}}" data-i18n="footer.profile">Profilo</a></li>
                <li><a href="{{DASHBOARD_PREMIUM_PAGE_URL}}" data-i18n="footer.premium">Premium</a></li>
              </ul>
            </nav>
            <nav class="vc-premium-footer__col" aria-label="Risorse" data-i18n-attr="aria-label:footer.resources">
              <h4 data-i18n="footer.resources">Risorse</h4>
              <ul>
                <li><a href="{{DASHBOARD_FAQ_PAGE_URL}}" data-i18n="footer.faq">FAQ</a></li>
                <li><a href="{{DASHBOARD_SUGGESTIONS_PAGE_URL}}" data-i18n="footer.feedback">Feedback</a></li>
                <li><a href="{{BOT_REVIEWS_PAGE_URL}}" data-i18n="footer.botReviews">Recensioni</a></li>
                <li><a href="{{STATUS_PAGE_URL}}" data-i18n="footer.status">Status</a></li>
                <li><a href="{{SITE_URL}}" data-i18n="footer.site">Sito</a></li>
              </ul>
            </nav>
          </div>
        </div>
        <div class="vc-premium-footer__legal">
          <p><a class="vc-footer-copy-link" href="{{COPYRIGHT_URL}}">© {{YEAR}} {{SITE_NAME}}. All rights reserved.</a></p>
          <nav aria-label="Link legali" data-i18n-attr="aria-label:footer.legalLinks">
            <a href="{{TERMS_URL}}" data-i18n="footer.terms">Termini di Servizio</a>
            <span aria-hidden="true"></span>
            <a href="{{PRIVACY_URL}}" data-i18n="footer.privacy">Privacy Policy</a>
            <span aria-hidden="true"></span>
            <a href="{{COOKIE_POLICY_URL}}" data-i18n="footer.cookies">Cookie Policy</a>
          </nav>
        </div>
      </div>
    </div>
  </footer>`;
}

/** Toglie Copyright / I tuoi dati dalla riga legale dei footer premium (anche già embedded). */
function stripPremiumFooterExtraLegalLinks(html) {
  return String(html || "").replace(
    /(<div class="vc-premium-footer__legal">\s*(?:<p>[\s\S]*?<\/p>\s*)?<nav\b[^>]*>)([\s\S]*?)(<\/nav>)/gi,
    (_full, open, inner, close) => {
      let next = String(inner || "");
      // Solo link espliciti della riga legale (data-i18n), mai href generici.
      next = next.replace(
        /\s*<span\b[^>]*aria-hidden="true"[^>]*>\s*<\/span>\s*<a\b[^>]*data-i18n="footer\.copyright"[^>]*>[\s\S]*?<\/a>/gi,
        "",
      );
      next = next.replace(
        /\s*<span\b[^>]*aria-hidden="true"[^>]*>\s*<\/span>\s*<a\b[^>]*data-i18n="footer\.yourData"[^>]*>[\s\S]*?<\/a>/gi,
        "",
      );
      next = next.replace(/\s*<a\b[^>]*data-i18n="footer\.copyright"[^>]*>[\s\S]*?<\/a>/gi, "");
      next = next.replace(/\s*<a\b[^>]*data-i18n="footer\.yourData"[^>]*>[\s\S]*?<\/a>/gi, "");
      return `${open}${next}${close}`;
    },
  );
}

/** Ripristina il link Tickets in navbar Richieste + colonna footer se manca. */
function ensureTicketsInRichiesteChrome(html) {
  let next = String(html || "");
  const ticketNavRow =
    '<a class="vc-snav-row" href="{{TICKETS_PAGE_URL}}"><span class="vc-snav-row-ico" aria-hidden="true"><i class="fa fa-ticket"></i></span><span data-i18n="nav.tickets">Tickets</span></a>';
  const ticketFooterLi = '<li><a href="{{TICKETS_PAGE_URL}}" data-i18n="footer.tickets">Tickets</a></li>';

  next = next.replace(
    /(<summary class="vc-snav-summary"><span[^>]*>\s*Richieste\s*<\/span>[\s\S]*?<div class="vc-snav-panel">)([\s\S]*?)(<\/div>\s*<\/details>)/gi,
    (full, open, inner, close) => {
      if (/\{\{(?:TICKETS_PAGE_URL|SUPPORTO_PAGE_URL)\}\}/.test(inner)) return full;
      let patched = String(inner || "");
      if (/\{\{RICHIESTE_SUGGERIMENTI_URL\}\}/.test(patched)) {
        patched = patched.replace(
          /(<a class="vc-snav-row(?:\s+vc-snav-row--active)?" href="\{\{RICHIESTE_SUGGERIMENTI_URL\}\}"[\s\S]*?<\/a>)/i,
          `$1\n                ${ticketNavRow}`,
        );
      } else {
        patched = `${patched.replace(/\s*$/, "")}\n                ${ticketNavRow}\n              `;
      }
      return `${open}${patched}${close}`;
    },
  );

  // Summary con solo data-i18n="nav.requests" senza testo "Richieste" literal in alcuni template.
  next = next.replace(
    /(<summary class="vc-snav-summary"><span[^>]*data-i18n="nav\.requests"[^>]*>[\s\S]*?<\/span>[\s\S]*?<div class="vc-snav-panel">)([\s\S]*?)(<\/div>\s*<\/details>)/gi,
    (full, open, inner, close) => {
      if (/\{\{(?:TICKETS_PAGE_URL|SUPPORTO_PAGE_URL)\}\}/.test(inner)) return full;
      let patched = String(inner || "");
      if (/\{\{RICHIESTE_SUGGERIMENTI_URL\}\}/.test(patched)) {
        patched = patched.replace(
          /(<a class="vc-snav-row(?:\s+vc-snav-row--active)?" href="\{\{RICHIESTE_SUGGERIMENTI_URL\}\}"[\s\S]*?<\/a>)/i,
          `$1\n                ${ticketNavRow}`,
        );
      } else {
        patched = `${patched.replace(/\s*$/, "")}\n                ${ticketNavRow}\n              `;
      }
      return `${open}${patched}${close}`;
    },
  );

  next = next.replace(
    /(<nav class="vc-premium-footer__col"[^>]*(?:data-i18n-attr="aria-label:footer\.requests"|aria-label="Richieste")[^>]*>[\s\S]*?<ul>)([\s\S]*?)(<\/ul>\s*<\/nav>)/gi,
    (full, open, inner, close) => {
      if (/\{\{(?:TICKETS_PAGE_URL|SUPPORTO_PAGE_URL)\}\}/.test(inner) || /data-i18n="footer\.tickets"/.test(inner)) {
        return full;
      }
      let patched = String(inner || "");
      if (/\{\{RICHIESTE_SUGGERIMENTI_URL\}\}/.test(patched)) {
        patched = patched.replace(
          /(<li><a href="\{\{RICHIESTE_SUGGERIMENTI_URL\}\}"[\s\S]*?<\/li>)/i,
          `$1\n                  ${ticketFooterLi}`,
        );
      } else {
        patched = `${patched.replace(/\s*$/, "")}\n                  ${ticketFooterLi}\n                `;
      }
      return `${open}${patched}${close}`;
    },
  );

  return next;
}

function replaceLegacyFooter(html) {
  // Pagine immersive / utility: niente upgrade a footer premium.
  if (
    html.includes("vc-hw-page") ||
    html.includes("vc-seratafilm-page") ||
    html.includes("vc-seratafilm") ||
    html.includes("vc-dashboard-transcript-page") ||
    html.includes('data-i18n="status.title"') ||
    html.includes("seratafilm/accesso-richiesto") ||
    /Serata Film/i.test(html)
  ) {
    return html;
  }
  const useDashboardFooter =
    html.includes("vc-dashboard-page") || html.includes("data-vc-dashboard-footer");
  const footerTpl = useDashboardFooter ? buildDashboardFooterTemplate() : buildPremiumFooterTemplate();
  let out = html;
  // Solo il footer di pagina (contenuto brand-row), mai altri <footer> UI (wizard, modal, …).
  // Il vecchio lookahead `(?=[\s\S]*?vc-footer-brand-row)` matchava QUALSIASI footer
  // precedente al brand-row e sostituiva Avanti / footers modal col footer premium.
  if (out.includes("vc-footer-brand-row")) {
    out = out.replace(
      /<footer\b[^>]*>[\s\S]*?vc-footer-brand-row[\s\S]*?<\/footer>/gi,
      footerTpl,
    );
  }
  // Footer minimale (es. copyright senza brand-row): upgrade al premium.
  out = out.replace(
    /<footer\b[^>]*class="[^"]*border-t border-white\/8[^"]*"[^>]*>[\s\S]*?<\/footer>/gi,
    footerTpl,
  );
  out = out.replace(
    /<footer\b[^>]*data-vc-dashboard-footer[^>]*>[\s\S]*?<\/footer>/gi,
    footerTpl,
  );
  return out;
}

function applyPlaceholderMap(html, map) {
  html = replaceLegacyFooter(html);
  html = ensureTicketsInRichiesteChrome(html);
  html = stripPremiumFooterExtraLegalLinks(html);
  for (const [key, value] of Object.entries(map)) {
    const ph = `{{${key}}}`;
    if (html.includes(ph)) {
      html = html.split(ph).join(String(value ?? ""));
    }
  }
  const assetVersion = encodeURIComponent(String(map.BUILD_ASSET_VERSION || ""));
  if (assetVersion) {
    html = html.replace(
      /href=(["'])([^"']*\/?css\/(?:tw-build|vc-landing|seratafilm-page)\.css)(?![?])\1/g,
      `href=$1$2?v=${assetVersion}$1`,
    );
    html = html.replace(
      /src=(["'])([^"']*\/?js\/[a-z0-9._-]+\.js)(?![?])\1/gi,
      `src=$1$2?v=${assetVersion}$1`,
    );
  }
  return ensureSeoEnhancements(ensureDiscordShareMeta(html, map), map);
}

/** Canonical + JSON-LD (homepage) per SEO / Lighthouse. */
function ensureSeoEnhancements(html, map) {
  let out = String(html || "");
  const pageOgUrl = (out.match(/<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/i) || [])[1] || "";
  const canonical = String(pageOgUrl || map?.OG_URL || map?.SITE_URL || "").trim();
  if (canonical && !/<link\s+rel=["']canonical["']/i.test(out)) {
    out = out.replace(/<\/head>/i, `    <link rel="canonical" href="${canonical}" />\n  </head>`);
  } else if (canonical && pageOgUrl) {
    // Prefer page og:url over homepage SITE_URL injected on subpages.
    out = out.replace(
      /(<link\s+rel=["']canonical["']\s+href=["'])([^"']+)(["']\s*\/?>)/i,
      `$1${canonical}$3`,
    );
  }
  if (!/<script[^>]+type=["']application\/ld\+json["']/i.test(out) && /vc-body--home|id=["']intro["']/i.test(out)) {
    const siteName = String(map?.SITE_NAME || "Vinili & Caffè");
    const desc = String(map?.META_DESCRIPTION || map?.OG_DESCRIPTION || "").trim();
    const siteUrl = String(map?.SITE_URL || canonical || "").replace(/\/+$/, "");
    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          name: siteName,
          url: `${siteUrl}/`,
          description: desc,
          inLanguage: "it-IT",
        },
        {
          "@type": "Organization",
          name: siteName,
          url: `${siteUrl}/`,
        },
      ],
    };
    const blob = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
    out = out.replace(/<\/head>/i, `    <script type="application/ld+json">${blob}</script>\n  </head>`);
  }
  return out;
}

/**
 * Discord embed: niente GIF animate del CDN guild (spesso senza banner),
 * + theme-color / dimensioni / twitter su tutte le pagine.
 */
function isDiscordAnimatedOgUrl(url) {
  return /cdn\.discordapp\.com\/(?:banners|icons)\/[^"'?\s]+\/a_[^"'?\s]+\.gif/i.test(
    String(url || ""),
  );
}

function ensureDiscordShareMeta(html, map) {
  let out = String(html || "");
  const ogImage = String(map?.OG_IMAGE_URL || "").trim();
  const ogW = String(map?.OG_IMAGE_WIDTH || "128").trim();
  const ogH = String(map?.OG_IMAGE_HEIGHT || "128").trim();
  const ogAlt = String(map?.OG_IMAGE_ALT || "").trim();
  const theme = String(map?.THEME_COLOR_HEX || "").trim();
  if (!ogImage) return out;
  const ogType = /\.gif(\?|$)/i.test(ogImage)
    ? "image/gif"
    : /\.png(\?|$)/i.test(ogImage)
      ? "image/png"
      : "image/jpeg";

  out = out.replace(
    /(<meta\s+property=["']og:image["']\s+content=["'])([^"']+)(["']\s*\/?>)/gi,
    (full, pre, url, post) => {
      // Sempre URL WA/Slack-safe (CF challenge su /images/* per alcuni crawler).
      if (isDiscordAnimatedOgUrl(url) || !/\/og\.(?:gif|jpg)(?:\?|$)/i.test(url)) {
        return `${pre}${ogImage}${post}`;
      }
      return full;
    },
  );
  out = out.replace(
    /(<meta\s+name=["']twitter:image["']\s+content=["'])([^"']+)(["']\s*\/?>)/gi,
    `$1${ogImage}$3`,
  );

  if (!/<meta\s+property=["']og:image["']/i.test(out)) {
    out = out.replace(
      /<\/head>/i,
      `    <meta property="og:image" content="${ogImage}" />\n    <meta property="og:image:secure_url" content="${ogImage}" />\n    <meta property="og:image:type" content="${ogType}" />\n    <meta property="og:image:width" content="${ogW}" />\n    <meta property="og:image:height" content="${ogH}" />\n    <meta name="twitter:card" content="summary" />\n    <meta name="twitter:image" content="${ogImage}" />\n  </head>`,
    );
  }

  const injectAfterOgImage = (snippet) => {
    if (!/<meta\s+property=["']og:image["']/i.test(out)) return;
    out = out.replace(/(<meta\s+property=["']og:image["'][^>]*>)/i, `$1\n    ${snippet}`);
  };

  if (!/property=["']og:image:width["']/i.test(out)) {
    injectAfterOgImage(
      `<meta property="og:image:width" content="${ogW}" />\n    <meta property="og:image:height" content="${ogH}" />` +
        (ogAlt ? `\n    <meta property="og:image:alt" content="${ogAlt}" />` : ""),
    );
  } else {
    out = out.replace(
      /(<meta\s+property=["']og:image:width["']\s+content=["'])([^"']+)/gi,
      `$1${ogW}`,
    );
    out = out.replace(
      /(<meta\s+property=["']og:image:height["']\s+content=["'])([^"']+)/gi,
      `$1${ogH}`,
    );
  }
  out = out.replace(
    /(<meta\s+name=["']twitter:card["']\s+content=["'])([^"']+)(["']\s*\/?>)/gi,
    `$1summary$3`,
  );
  // Browser/PWA chrome only. Discord embed sidebar is swapped at nginx
  // for Discordbot (see deploy/patch-nginx-discord-embed-theme.py).
  const browserTheme = theme || "#140f0c";
  out = out.replace(/\s*<meta[^>]+name=["']theme-color["'][^>]*>/gi, "");
  out = out.replace(
    /<head([^>]*)>/i,
    `<head$1>\n    <meta name="theme-color" content="${browserTheme}" />`,
  );
  if (!/name=["']twitter:card["']/i.test(out)) {
    injectAfterOgImage(
      `<meta name="twitter:card" content="summary" />\n    <meta name="twitter:image" content="${ogImage}" />`,
    );
  }
  // WhatsApp / Slack / iMessage: secure_url + type + image_src (and CF-safe JPEG path).
  if (!/property=["']og:image:secure_url["']/i.test(out)) {
    injectAfterOgImage(`<meta property="og:image:secure_url" content="${ogImage}" />`);
  }
  if (!/property=["']og:image:type["']/i.test(out)) {
    injectAfterOgImage(`<meta property="og:image:type" content="${ogType}" />`);
  } else {
    out = out.replace(
      /(<meta\s+property=["']og:image:type["']\s+content=["'])([^"']+)/gi,
      `$1${ogType}`,
    );
  }
  if (!/rel=["']image_src["']/i.test(out)) {
    injectAfterOgImage(`<link rel="image_src" href="${ogImage}" />`);
  }
  if (!/itemprop=["']image["']/i.test(out)) {
    injectAfterOgImage(`<meta itemprop="image" content="${ogImage}" />`);
  }
  const pageOgTitle = (out.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) || [])[1] || "";
  const pageOgDesc = (out.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) || [])[1] || "";
  const twitterTitle = String(pageOgTitle || map?.OG_TITLE || "").trim();
  const twitterDesc = String(pageOgDesc || map?.OG_DESCRIPTION || "").trim();
  if (twitterTitle) {
    if (!/name=["']twitter:title["']/i.test(out)) {
      injectAfterOgImage(
        `<meta name="twitter:title" content="${twitterTitle}" />\n    <meta name="twitter:description" content="${twitterDesc}" />`,
      );
    } else {
      // Subpages: never keep homepage twitter:title if page already has og:title.
      out = out.replace(
        /(<meta\s+name=["']twitter:title["']\s+content=["'])([^"']+)(["']\s*\/?>)/i,
        `$1${twitterTitle}$3`,
      );
      if (twitterDesc && /name=["']twitter:description["']/i.test(out)) {
        out = out.replace(
          /(<meta\s+name=["']twitter:description["']\s+content=["'])([^"']+)(["']\s*\/?>)/i,
          `$1${twitterDesc}$3`,
        );
      }
    }
  }
  const appleTouchIcon =
    `<link rel="apple-touch-icon" sizes="180x180" href="/favicon.ico?v=iosfix6" />\n    <link rel="apple-touch-icon" href="/favicon.ico?v=iosfix6" />\n    <link rel="apple-touch-icon-precomposed" sizes="180x180" href="/favicon.ico?v=iosfix6" />\n    <link rel="icon" type="image/png" sizes="180x180" href="/favicon.ico?v=iosfix6" />\n    <link rel="shortcut icon" href="/favicon.ico?v=iosfix6" />`;
  // Prefer apple-touch early in <head>; strip Discord GIF favicons that steal iOS icon pick.
  // NOTE: Cloudflare Managed Challenge blocks /apple-touch-icon*.png for Safari's
  // icon fetcher; only /favicon.ico is allowed without challenge — keep icons there.
  out = out.replace(
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*cdn\.discordapp\.com[^>]*>\s*/gi,
    "",
  );
  if (!/rel=["']manifest["']/i.test(out)) {
    out = out.replace(
      /<\/head>/i,
      `  <link rel="manifest" href="/site.webmanifest?v=20260825pwa7" />\n    <meta name="apple-mobile-web-app-capable" content="yes" />\n    <meta name="mobile-web-app-capable" content="yes" />\n    <meta name="apple-mobile-web-app-title" content="Vinili & Caffè" />\n    ${appleTouchIcon}\n  </head>`,
    );
  } else {
    out = out.replace(
      /<link[^>]+rel=["']apple-touch-icon(?:-precomposed)?["'][^>]*>\s*/gi,
      "",
    );
    out = out.replace(/<head([^>]*)>/i, `<head$1>\n    ${appleTouchIcon}`);
    if (!/name=["']apple-mobile-web-app-title["']/i.test(out)) {
      out = out.replace(
        /<\/head>/i,
        `  <meta name="apple-mobile-web-app-title" content="Vinili & Caffè" />\n  </head>`,
      );
    } else {
      out = out.replace(
        /<meta[^>]+name=["']apple-mobile-web-app-title["'][^>]*>/gi,
        `<meta name="apple-mobile-web-app-title" content="Vinili & Caffè" />`,
      );
    }
    out = out.replace(
      /(href=["'])\/site\.webmanifest(?:\?[^"']*)?(["'])/i,
      `$1/site.webmanifest?v=20260825pwa7$2`,
    );
  }
  return out;
}

function warnLeftoverPlaceholders(html, label) {
  const leftover = [...html.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((m) => m[1]);
  if (leftover.length) {
    console.warn(`Placeholder non sostituiti (${label}):`, [...new Set(leftover)].join(", "));
  }
}

/** Evita pubblicare un dist incompleto (es. build interrotta dopo copyRecursive). */
function assertDistHasNoTemplatePlaceholders(distDir) {
  const re = /\{\{[A-Z0-9_]+\}\}/g;
  const bad = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, name.name);
      if (name.isDirectory()) {
        walk(p);
        continue;
      }
      if (!name.name.toLowerCase().endsWith(".html")) continue;
      const html = fs.readFileSync(p, "utf8");
      const found = html.match(re);
      if (found && found.length) {
        bad.push({
          rel: path.relative(distDir, p),
          keys: [...new Set(found)].slice(0, 12).join(", "),
        });
      }
    }
  }
  walk(distDir);
  if (bad.length) {
    const msg = bad.map((b) => `  ${b.rel}: ${b.keys}`).join("\n");
    throw new Error(`[build-site] dist/ contiene ancora placeholder {{...}} (build incompleta o pagina non processata):\n${msg}`);
  }
}

function inviteCodeFromConfig(cfg) {
  const explicit = String(cfg.discordInviteCode || "").trim();
  if (explicit) return explicit;
  const url = String(cfg.discordInviteUrl || "").trim();
  const m = url.match(/discord\.(?:gg|com\/invite)\/([a-zA-Z0-9-]+)/i);
  return m ? m[1] : "";
}

function guildBannerCdnUrl(guildId, bannerHash) {
  const gid = String(guildId || "").trim();
  const h = String(bannerHash || "").trim();
  if (!gid || !h) return "";
  const ext = h.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/banners/${gid}/${h}.${ext}?size=2048`;
}

function guildIconCdnUrl(guildId, iconHash, size = 256) {
  const gid = String(guildId || "").trim();
  const h = String(iconHash || "").trim();
  if (!gid || !h) return "";
  const ext = h.startsWith("a_") ? "gif" : "png";
  const s = Math.max(16, Math.min(4096, Number(size) || 256));
  return `https://cdn.discordapp.com/icons/${gid}/${h}.${ext}?size=${s}`;
}

/** URL assoluto per og:image (Discord anteprima link) se path è relativo. */
function absUrlForMetadata(siteUrl, pathOrUrl) {
  const p = String(pathOrUrl || "").trim();
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  const base = String(siteUrl || "").trim().replace(/\/+$/, "");
  if (!base) return p;
  return `${base}/${p.replace(/^\//, "")}`;
}

/** Normalizza og:image: niente GIF animate Discord CDN (Discord spesso non mostra il banner). */
function forceStaticOgImageUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (/cdn\.discordapp\.com\/(?:banners|icons)\/[^/]+\/a_[^/?#]+\.gif/i.test(raw)) {
    return "";
  }
  try {
    return new URL(raw).toString();
  } catch {
    return raw;
  }
}

/** Data approssimativa di creazione guild dall’ID snowflake (l’API invite non espone created_at). */
function snowflakeGuildCreatedUtcDate(guildId) {
  try {
    const bid = BigInt(String(guildId || "").trim());
    const ms = Number(bid >> 22n) + DISCORD_EPOCH_MS;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

function formatItalianDateRome(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** Stesso query string usato da `js/live-stats.js` sul fallback Discord. */
async function fetchInviteInvitePayload(inviteCode) {
  const code = String(inviteCode || "").trim();
  if (!code) return null;
  const url = `https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true`;
  let res;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "ViniliCaffeWebBuild/1.0 (static site; +https://www.viniliecaffe.it)",
      },
    });
  } catch (e) {
    console.warn("[build-site] fetch invite fallito:", e?.message || e);
    return null;
  }
  if (!res.ok) {
    console.warn("[build-site] invite API HTTP", res.status, code);
    return null;
  }
  try {
    const data = await res.json();
    const guild = data?.guild;
    const snap =
      guild?.id != null
        ? {
            guildId: guild.id,
            banner: guild.banner,
            icon: guild.icon,
            approximateMemberCount: data.approximate_member_count,
            boostCount: guild.premium_subscription_count,
            guildDescription:
              guild.description != null && String(guild.description).trim()
                ? String(guild.description)
                : "",
          }
        : null;
    return { snap, raw: data };
  } catch (e) {
    console.warn("[build-site] JSON invite:", e?.message || e);
    return null;
  }
}

async function fetchInviteGuildSnapshot(inviteCode) {
  const p = await fetchInviteInvitePayload(inviteCode);
  return p?.snap ?? null;
}

function discordCdnUserAvatarUrl(userId, avatarHash) {
  const id = String(userId || "").trim();
  if (!id) return null;
  const h = avatarHash != null ? String(avatarHash).trim() : "";
  if (h) {
    const ext = h.startsWith("a_") ? "gif" : "webp";
    return `https://cdn.discordapp.com/avatars/${id}/${h}.${ext}?size=256`;
  }
  try {
    const idx = Number((BigInt(id) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  } catch {
    return "https://cdn.discordapp.com/embed/avatars/1.png";
  }
}

/** Avatar dell’account bot da Discord API (richiede token del bot). */
async function fetchBotSelfAvatarUrl(botToken, label) {
  const t = String(botToken || "").trim();
  if (!t) return null;
  try {
    const res = await discordBotGet("/users/@me", t);
    if (!res.ok) {
      console.warn(`[build-site] Wiki avatar ${label}: GET /users/@me HTTP`, res.status);
      return null;
    }
    const u = await res.json().catch(() => null);
    const id = String(u?.id || "").trim();
    if (!id) return null;
    return discordCdnUserAvatarUrl(id, u?.avatar);
  } catch (e) {
    console.warn(`[build-site] Wiki avatar ${label}:`, e?.message || e);
    return null;
  }
}

async function discordBotGet(path, botToken, attempt = 0) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    headers: {
      Authorization: `Bot ${botToken}`,
      "User-Agent": "ViniliCaffeWebBuild/1.0 (staff-list)",
    },
  });
  if (res.status === 429 && attempt < 8) {
    let waitSec = 1;
    try {
      const j = await res.clone().json();
      waitSec = Number(j.retry_after) || 1;
    } catch {
      waitSec = 1;
    }
    await new Promise((r) => setTimeout(r, Math.ceil(waitSec * 1000) + 200));
    return discordBotGet(path, botToken, attempt + 1);
  }
  if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < 6) {
    await new Promise((r) => setTimeout(r, 800 + attempt * 1200));
    return discordBotGet(path, botToken, attempt + 1);
  }
  return res;
}

/** Conteggi membri/boost da GET /guilds/:id?with_counts=true. Preferisci `approximate_member_count` (totale pubblico); `member_count` può essere più basso o non affidabile. */
async function fetchGuildLiveStatsCountsFromBot(guildId, botToken) {
  const gid = String(guildId || "").trim();
  const t = String(botToken || "").trim();
  if (!gid || !t) return null;
  const res = await discordBotGet(`/guilds/${encodeURIComponent(gid)}?with_counts=true`, t);
  if (!res.ok) {
    console.warn("[build-site] Guild live counts HTTP", res.status, gid);
    return null;
  }
  const g = await res.json().catch(() => null);
  if (!g || typeof g !== "object") return null;
  const memberCount =
    g.approximate_member_count != null && Number.isFinite(Number(g.approximate_member_count))
      ? Math.floor(Number(g.approximate_member_count))
      : g.member_count != null && Number.isFinite(Number(g.member_count))
        ? Math.floor(Number(g.member_count))
        : null;
  const boostCount =
    g.premium_subscription_count != null && Number.isFinite(Number(g.premium_subscription_count))
      ? Math.floor(Number(g.premium_subscription_count))
      : null;
  const presenceCount =
    g.approximate_presence_count != null && Number.isFinite(Number(g.approximate_presence_count))
      ? Math.floor(Number(g.approximate_presence_count))
      : null;
  return { memberCount, boostCount, presenceCount };
}

async function fetchGuildRoleMetas(guildId, botToken) {
  const map = new Map();
  const res = await discordBotGet(`/guilds/${guildId}/roles`, botToken);
  if (!res.ok) {
    console.warn("[build-site] Guild roles HTTP", res.status);
    return { ok: false, map, httpStatus: res.status };
  }
  const roles = await res.json().catch(() => []);
  if (!Array.isArray(roles)) return { ok: true, map };
  for (const r of roles) {
    const id = String(r?.id || "");
    if (!id) continue;
    map.set(id, {
      name: String(r?.name || id),
      position: Number(r?.position ?? 0),
      premiumSubscriber: Boolean(r?.tags && Object.prototype.hasOwnProperty.call(r.tags, "premium_subscriber")),
    });
  }
  return { ok: true, map };
}

async function fetchGuildOwnerId(guildId, botToken) {
  const gid = String(guildId || "").trim();
  const tok = String(botToken || "").trim();
  if (!gid || !tok) return "";
  const res = await discordBotGet(`/guilds/${encodeURIComponent(gid)}`, tok);
  if (!res.ok) {
    console.warn("[build-site] Guild owner fetch HTTP", res.status);
    return "";
  }
  const data = await res.json().catch(() => null);
  const ownerId = String(data?.owner_id || "").trim();
  return /^\d{16,22}$/.test(ownerId) ? ownerId : "";
}

async function fetchGuildMembersUpTo(guildId, botToken, maxTotal) {
  const cap = Math.min(Math.max(1, Number(maxTotal) || 4000), 50000);
  const all = [];
  let after = "";
  while (all.length < cap) {
    const q = new URLSearchParams({ limit: "1000" });
    if (after) q.set("after", after);
    const res = await discordBotGet(`/guilds/${guildId}/members?${q}`, botToken);
    if (!res.ok) {
      console.warn(
        "[build-site] Guild members HTTP",
        res.status,
        "(abilita «Server Members Intent» nel portale Discord del bot e assicurati che il bot sia nel server).",
      );
      break;
    }
    const chunk = await res.json().catch(() => []);
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    for (const m of chunk) {
      all.push(m);
      if (all.length >= cap) break;
    }
    if (chunk.length < 1000 || all.length >= cap) break;
    const lastId = chunk[chunk.length - 1]?.user?.id;
    if (!lastId) break;
    after = String(lastId);
  }
  return all;
}

function memberRoleIds(m) {
  const ids = m?.roles;
  if (Array.isArray(ids)) return ids.map(String);
  return [];
}

function maintenanceBypassUserIdsFromMembers(members, roleIdList) {
  const roleSet = new Set(
    (Array.isArray(roleIdList) ? roleIdList : []).map((x) => String(x).trim()).filter(Boolean),
  );
  if (!roleSet.size || !Array.isArray(members)) return [];
  const out = [];
  const seen = new Set();
  for (const m of members) {
    if (!m?.user || m.user.bot) continue;
    if (!memberRoleIds(m).some((r) => roleSet.has(String(r)))) continue;
    const uid = String(m.user.id).trim();
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
  }
  return out;
}

/** Nome in elenco tipo “Blear#3218” (discriminator) o display / @handle senza #0. */
function memberStaffLineName(m) {
  const u = m?.user;
  if (!u) return "Utente";
  const cleanup = (v) =>
    String(v || "")
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
      .trim();
  const meaningful = (v) => {
    const s = cleanup(v);
    return /\p{L}|\p{N}/u.test(s) ? s : "";
  };
  const un = meaningful(u.username);
  const disc = String(u.discriminator ?? "0");
  if (disc && disc !== "0") return `${un}#${disc}`;
  return un || "Utente";
}

function memberStaffDisplayName(m, ownerUserId = "") {
  void ownerUserId;
  return memberBoostDisplayName(m);
}

/** Nick / global name come in Discord; salta nick “vuoti” (spazi invisibili, una lettera). */
function memberBoostDisplayName(m) {
  const cleanup = (v) =>
    String(v || "")
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
      .trim();
  const usable = (v) => {
    const s = cleanup(v);
    if (!s) return "";
    const compact = s.replace(/[\s\u3164\u2800\u115F\u1160\u1CB0\uFFA0]/g, "");
    const chars = compact.match(/\p{L}|\p{N}/gu) || [];
    return chars.length >= 2 ? s : "";
  };
  return (
    usable(m?.nick) ||
    usable(m?.user?.global_name) ||
    usable(m?.user?.globalName) ||
    usable(m?.user?.username) ||
    memberStaffLineName(m)
  );
}

function memberStaffProfileHref(m) {
  const uid = String(m?.user?.id || "").trim();
  if (!/^\d{16,22}$/.test(uid)) return "#";
  return `/user/?id=${encodeURIComponent(uid)}`;
}

function memberStaffAvatarUrl(m, guildId = "") {
  const uid = String(m?.user?.id || "").trim();
  if (!uid) return "";
  // Preferisci avatar globale PNG: gli hash guild/webp scadono spesso (404 → lettera fallback).
  const userHash = m?.user?.avatar != null ? String(m.user.avatar).trim() : "";
  if (userHash) {
    return `https://cdn.discordapp.com/avatars/${uid}/${userHash}.png?size=80`;
  }
  const gid = String(guildId || "").trim();
  const guildHash = m?.avatar != null ? String(m.avatar).trim() : "";
  if (gid && guildHash) {
    return `https://cdn.discordapp.com/guilds/${gid}/users/${uid}/avatars/${guildHash}.png?size=80`;
  }
  return discordCdnUserAvatarUrl(uid, "") || "";
}

function staffHoverMemberPayload(mem, roleId, roleLabel, ownerUserId, guildId, flags = {}) {
  return {
    name: memberStaffDisplayName(mem, ownerUserId),
    avatarUrl: memberStaffAvatarUrl(mem, guildId) || "",
    profileUrl: memberStaffProfileHref(mem),
    isOwner: isServerOwnerMember(mem, ownerUserId),
    isNew: flags.isNew === true,
    isPaused: flags.isPaused === true,
    roleId: String(roleId || "").trim(),
    roleLabel: String(roleLabel || "").trim(),
  };
}

function isServerOwnerMember(m, ownerUserId = "") {
  const uid = String(m?.user?.id || "").trim();
  return Boolean(uid && ownerUserId && uid === ownerUserId);
}

function ownerBadgeHtml() {
  return '<span class="vc-owner-badge" title="Server Owner" aria-label="Server Owner">Owner</span>';
}

function staffNewBadgeHtml() {
  return '<span class="vc-staff-new-badge" title="Nuovo staff" aria-label="Nuovo staff">Nuovo</span>';
}

function staffPauseBadgeHtml() {
  return '<span class="vc-staff-pause-badge" title="In pausa" aria-label="In pausa">Pausa</span>';
}

function hueFromDiscordRoleId(roleId) {
  const s = String(roleId || "");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function staffRoleBadgeHtml(roleLabel, roleId = "") {
  const raw = String(roleLabel || "").trim();
  if (!raw) return "";
  const hue = hueFromDiscordRoleId(String(roleId || "").trim() || raw);
  const title = escAttr(raw);
  const upper = escHtml(raw.toUpperCase());
  return `<span class="vc-staff-role-badge" style="--vc-staff-badge-h:${hue}" title="${title}" aria-label="${title}">${upper}</span>`;
}

function isGenericStaffRoleLabel(label) {
  const norm = String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
  if (!norm) return false;
  return norm === "staff" || norm === "high staff" || norm === "highstaff";
}

function staffListFallback() {
  return { html: STAFF_LIST_FALLBACK_HTML, staffCount: null, staffHoverGroups: [], boostHoverMembers: [] };
}

function parseSiteSponsorAdMs(value, endOfDay) {
  let d = String(value || "").trim();
  if (!d) return NaN;
  d = d.replace(/T(\d{2}):(\d{2}):(\d{2}):(\d{2})$/, "T$1:$2:$3");
  if (d.indexOf("T") < 0 && endOfDay) return new Date(`${d}T23:59:59.999`).getTime();
  if (d.indexOf("T") < 0) return new Date(`${d}T00:00:00`).getTime();
  const ms = new Date(d).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function buildKickLivePipBootHtml(cfg, opts) {
  const pip = cfg.kickLivePip && typeof cfg.kickLivePip === "object" ? cfg.kickLivePip : null;
  if (!pip || pip.enabled === false) return "";
  const scriptPrefix = opts && typeof opts.scriptPrefix === "string" ? opts.scriptPrefix : "";
  const scriptSrc = scriptPrefix ? `${scriptPrefix}js/vc-kick-pip.js` : "/js/vc-kick-pip.js";
  const syncSrc = scriptPrefix ? `${scriptPrefix}js/vc-chrome-sync.js` : "/js/vc-chrome-sync.js";
  const pollMs = Number.isFinite(Number(pip.pollIntervalMs)) ? Number(pip.pollIntervalMs) : 90000;
  const previewLimitMs = Number.isFinite(Number(pip.previewLimitMs)) ? Number(pip.previewLimitMs) : 600000;
  const payload = {
    enabled: true,
    apiUrl: String(pip.apiUrl || "/webhooks/site-kick-live").trim() || "/webhooks/site-kick-live",
    apiUrlLocal: String(pip.apiUrlLocal || "").trim(),
    subApiUrl: String(pip.subApiUrl || "/webhooks/site-kick-sub").trim() || "/webhooks/site-kick-sub",
    pollIntervalMs: Math.max(30000, Math.min(180000, pollMs)),
    previewLimitMs: Math.max(60000, Math.min(3600000, previewLimitMs)),
  };
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return (
    `    <script>window.__VC_KICK_PIP=${json};</script>\n` +
    `    <script src="${syncSrc}" defer></script>\n` +
    `    <script src="${scriptSrc}" defer></script>\n`
  );
}

function applyKickLivePipToDist(distDir, cfg) {
  const pip = cfg.kickLivePip && typeof cfg.kickLivePip === "object" ? cfg.kickLivePip : null;
  if (!pip || pip.enabled === false) return;
  // Solo homepage: non iniettare Kick PIP su altre pagine.
  const homePath = path.join(distDir, "index.html");
  if (!fs.existsSync(homePath)) return;
  const html = fs.readFileSync(homePath, "utf8");
  if (html.includes("window.__VC_KICK_PIP") || html.includes("js/vc-kick-pip.js")) return;
  if (html.includes("vc-seratafilm-page") || html.includes("vc-dashboard-page")) return;
  const boot = buildKickLivePipBootHtml(cfg, { scriptPrefix: "/" });
  if (!boot) return;
  let next = html;
  if (next.includes("</body>")) next = next.replace("</body>", `${boot}  </body>`);
  else if (next.includes("</head>")) next = next.replace("</head>", `${boot}  </head>`);
  else next += `\n${boot}`;
  if (next !== html) fs.writeFileSync(homePath, next, "utf8");
}

function buildSiteSponsorAdBootHtml(cfg, opts) {
  const ad = cfg.siteSponsorAd && typeof cfg.siteSponsorAd === "object" ? cfg.siteSponsorAd : null;
  if (!ad || ad.enabled === false) return "";
  const scriptPrefix = opts && typeof opts.scriptPrefix === "string" ? opts.scriptPrefix : "";
  const scriptSrc = scriptPrefix ? `${scriptPrefix}js/vc-site-sponsor-ad.js` : "/js/vc-site-sponsor-ad.js";
  let startMs = Number(ad.startMs);
  let untilMs = Number(ad.untilMs);
  if (!Number.isFinite(startMs)) startMs = parseSiteSponsorAdMs(ad.startAt, false);
  if (!Number.isFinite(untilMs)) untilMs = parseSiteSponsorAdMs(ad.until, true);
  const payload = {
    enabled: true,
    id: String(ad.id || "site-sponsor").trim() || "site-sponsor",
    title: String(ad.title || "").trim(),
    badge: String(ad.badge || "Sponsor").trim() || "Sponsor",
    description: String(ad.description || "").trim(),
    buttonUrl: String(ad.buttonUrl || "").trim(),
    buttonLabel: String(ad.buttonLabel || "Entra nel server").trim() || "Entra nel server",
    startAt: String(ad.startAt || "").trim(),
    until: String(ad.until || "").trim(),
    startMs: Number.isFinite(startMs) ? startMs : null,
    untilMs: Number.isFinite(untilMs) ? untilMs : null,
  };
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return (
    `    <script>window.__VC_SITE_SPONSOR_AD=${json};</script>\n` +
    `    <script src="${scriptSrc}" defer></script>\n`
  );
}

function applySiteSponsorAdToDist(distDir, cfg) {
  const ad = cfg.siteSponsorAd && typeof cfg.siteSponsorAd === "object" ? cfg.siteSponsorAd : null;
  if (!ad || ad.enabled === false) return;
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (!name.toLowerCase().endsWith(".html")) continue;
      const html = fs.readFileSync(p, "utf8");
      if (html.includes("window.__VC_SITE_SPONSOR_AD") || html.includes("js/vc-site-sponsor-ad.js")) continue;
      if (html.includes("vc-seratafilm-page")) continue;
      const scriptPrefix = relativeScriptPrefixFromHtml(p);
      const boot = buildSiteSponsorAdBootHtml(cfg, { scriptPrefix });
      if (!boot) continue;
      let next = html;
      if (next.includes("</body>")) next = next.replace("</body>", `${boot}  </body>`);
      else if (next.includes("</head>")) next = next.replace("</head>", `${boot}  </head>`);
      else next += `\n${boot}`;
      if (next !== html) fs.writeFileSync(p, next, "utf8");
    }
  };
  walk(distDir);
}

function buildLiveStatsBootHtml(cfg, inviteCode, opts) {
  const scriptPrefix = opts && typeof opts.scriptPrefix === "string" ? opts.scriptPrefix : "";
  const ls = cfg.liveStats || {};
  if (ls.enabled === false) return "";
  const code = String(inviteCode || "").trim();
  const inviteProxy =
    ls.inviteProxyPath === ""
      ? ""
      : String(ls.inviteProxyPath != null ? ls.inviteProxyPath : "/discord-invite.json");
  const extraStats =
    ls.extraStatsPath === "" || ls.extraStatsPath == null
      ? "/live-stats-extra.json"
      : String(ls.extraStatsPath);
  const pollMs = Number.isFinite(Number(ls.pollIntervalMs)) ? Number(ls.pollIntervalMs) : 45000;
  const introFallbackMs = Number.isFinite(Number(ls.introFallbackMs)) ? Number(ls.introFallbackMs) : 45000;
  const liveEventApiUrl = String(cfg.liveEventApiUrl || "").trim();
  const liveEventApiUrlLocal = String(cfg.liveEventApiUrlLocal || "").trim();
  const liveEventPollMsRaw = ls.liveEventPollMs != null ? Number(ls.liveEventPollMs) : 90000;
  const liveEventPollMs = Number.isFinite(liveEventPollMsRaw)
    ? Math.max(20000, Math.min(600000, liveEventPollMsRaw))
    : 90000;
  const payload = {
    enabled: true,
    inviteCode: code,
    inviteProxyPath: inviteProxy,
    extraStatsPath: extraStats,
    pollIntervalMs: pollMs,
    introFallbackMs,
    liveEventApiUrl,
    liveEventApiUrlLocal,
    liveEventPollMs,
  };
  if (Array.isArray(opts.staffHoverGroups) && opts.staffHoverGroups.length) {
    payload.staffHoverGroups = opts.staffHoverGroups;
  }
  if (Array.isArray(opts.boostHoverMembers) && opts.boostHoverMembers.length) {
    payload.boostHoverMembers = opts.boostHoverMembers;
  }
  if (opts.memberPulse && typeof opts.memberPulse === "object") {
    payload.memberPulse = opts.memberPulse;
  }
  if (opts.communityHours && typeof opts.communityHours === "object") {
    payload.communityHours = opts.communityHours;
  }
  if (opts.staffNoPm != null && Number.isFinite(Number(opts.staffNoPm))) {
    payload.staffNoPm = Math.floor(Number(opts.staffNoPm));
  }
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return (
    `    <script>window.__VC_LIVE=${json};</script>\n` +
    `    <script src="${scriptPrefix}js/live-stats.js" defer></script>\n`
  );
}

function boolFromEnv(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return null;
}

function listFromCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildMaintenanceBootHtml(cfg, extra = {}) {
  const maintenance = cfg.maintenance && typeof cfg.maintenance === "object" ? cfg.maintenance : {};
  const envEnabled = boolFromEnv(process.env.VC_SITE_MAINTENANCE);
  const enabled = envEnabled == null ? maintenance.enabled === true : envEnabled;
  const envAllowedIds = listFromCsv(process.env.VC_SITE_MAINTENANCE_ALLOWED_IDS);
  const fromConfig = Array.isArray(maintenance.allowedUserIds)
    ? maintenance.allowedUserIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const fromStaffRaw = Array.isArray(extra.guildStaffBypassIds) ? extra.guildStaffBypassIds : [];
  const fromStaff = fromStaffRaw.map((id) => String(id || "").trim()).filter(Boolean);
  const includeStaffBypass = maintenance.includeGuildStaffInMaintenanceBypass === true;
  const staffBypassIds = includeStaffBypass ? fromStaff : [];
  const allowedUserIds = envAllowedIds.length
    ? envAllowedIds
    : [...new Set([...fromConfig, ...staffBypassIds])];
  const payload = {
    enabled,
    allowedUserIds,
    title: String(maintenance.title || "Sito in manutenzione"),
    message: String(maintenance.message || "Stiamo sistemando alcune parti del sito. Torna tra poco!"),
    clientId: String(cfg.discordOauth?.clientId || "").trim(),
    redirectUri: String(cfg.discordOauth?.redirectUri || cfg.siteUrl || "").trim(),
  };
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  const extensionNoiseBoot = `    <script>(function(){function s(x,d){try{d=d||0;if(x&&typeof x==="object"){var p=[];if(x.message!=null)p.push(String(x.message));if(x.stack!=null)p.push(String(x.stack));if(x.name!=null)p.push(String(x.name));if(d<2&&x.reason!=null)p.push(s(x.reason,d+1));if(d<2&&x.error!=null)p.push(s(x.error,d+1));if(p.length)return p.join(" ")}return String(x||"")}catch(e){return""}}function n(x){var m=s(x);return /listener indicated an asynchronous response/i.test(m)||/listener.*returning true.*(?:message )?channel closed/i.test(m)||/asynchronous response by returning true/i.test(m)||/message channel closed before a response was received/i.test(m)||/channel closed before a response was received/i.test(m)||/closed before a response was received/i.test(m)||/could not establish connection\\.?\\s*receiving end does not exist/i.test(m)||/message port closed before a response was received/i.test(m)||/extension context invalidated/i.test(m)||/unchecked runtime\\.lasterror/i.test(m)||/wrappedSendMessageCallback/i.test(m)||/cookieCrumbler\\.js/i.test(m)||/chrome-extension:\\/\\//i.test(m)||/moz-extension:\\/\\//i.test(m)||(/cannot read properties of undefined/i.test(m)&&/useCache/i.test(m))||(/font-size:\\s*0;\\s*color:\\s*transparent/i.test(m)&&/NaN/i.test(m))||/challenges\\.cloudflare\\.com/i.test(m)}function tf(a){try{var f=String(a[0]||"");if(/font-size:\\s*0;\\s*color:\\s*transparent/i.test(f))return true;if(/%c%d/i.test(f)&&(a[1]!==a[1]||a[1]==null))return true}catch(e){}return false}function h(e){if(!n(e&&e.reason)&&!n(e&&e.message)&&!n(e&&e.error))return;try{e.preventDefault();e.stopImmediatePropagation()}catch(_e){}}window.addEventListener("unhandledrejection",h,true);window.addEventListener("error",h,true);window.onunhandledrejection=h;["error","warn","log","info","debug"].forEach(function(l){var o=console[l];if(typeof o!=="function")return;console[l]=function(){if(tf(arguments))return;var a="";for(var i=0;i<arguments.length;i++)a+=" "+s(arguments[i]);if(n(a)||/forced reflow while executing javascript took/i.test(a))return;return o.apply(console,arguments)}})})();</script>\n`;
  const trustedTypesBoot = `    <script>(function(){try{if(window.trustedTypes){window.trustedTypes.createPolicy("default",{createHTML:function(s){return String(s)},createScript:function(s){return String(s)},createScriptURL:function(s){return String(s)}})}}catch(e){}})();</script>\n`;
  return (
    extensionNoiseBoot +
    trustedTypesBoot +
    `    <script src="/js/vc-suppress-extension-errors.js" defer></script>\n` +
    `    <script>(function(){var w=window;w.__VC_MAINTENANCE=${json};var m=w.__VC_MAINTENANCE;if(!m||m.enabled!==true)return;var de=w.document.documentElement;de.classList.add("vc-maintenance-pending");try{de.style.overflow="hidden";de.style.height="100%";}catch(e1){}})();</script>\n` +
    `    <script src="/js/site-maintenance.js" defer></script>\n`
  );
}

function applyMaintenanceGateToHtml(html, maintenanceBoot) {
  if (!maintenanceBoot || html.includes("window.__VC_MAINTENANCE")) return html;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${maintenanceBoot}  </head>`);
  }
  const headOpen = html.match(/<head\b[^>]*>/i);
  if (headOpen) {
    return html.replace(headOpen[0], `${headOpen[0]}\n${maintenanceBoot}`);
  }
  return maintenanceBoot + html;
}

function applyMaintenanceGateToDist(distDir, maintenanceBoot) {
  if (!maintenanceBoot) return;
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (!name.toLowerCase().endsWith(".html")) continue;
      const html = fs.readFileSync(p, "utf8");
      const next = applyMaintenanceGateToHtml(html, maintenanceBoot);
      if (next !== html) fs.writeFileSync(p, next, "utf8");
    }
  };
  walk(distDir);
}

function collectDistHtmlRoutes(distDir) {
  const paths = new Set(["/"]);
  const walk = (dir, segments) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        walk(p, segments.concat(name));
        continue;
      }
      if (name.toLowerCase() !== "index.html") continue;
      const route = segments.length ? `/${segments.join("/")}` : "/";
      paths.add(route);
    }
  };
  walk(distDir, []);
  return [...paths].sort();
}

const ROBOTS_DISALLOW_PREFIXES = [
  "/dashboard",
  "/staff",
  "/seratafilm/accesso-richiesto",
  "/candidature/accesso-richiesto",
  "/appelli/accesso-richiesto",
  "/unban",
  "/unmute",
  "/supporto",
  "/stato",
  "/staff/ticket",
];

function writeRobotsAndSitemap(distDir, cfg) {
  const siteBase = String(cfg?.siteUrl || "https://www.viniliecaffe.it").trim().replace(/\/+$/, "");
  const routes = collectDistHtmlRoutes(distDir);
  const robotsLines = ["User-agent: *", "Allow: /"];
  for (const prefix of ROBOTS_DISALLOW_PREFIXES) {
    robotsLines.push(`Disallow: ${prefix}`);
  }
  robotsLines.push("", `Sitemap: ${siteBase}/sitemap.xml`, "");
  fs.writeFileSync(path.join(distDir, "robots.txt"), `${robotsLines.join("\n")}\n`, "utf8");

  const publicRoutes = routes.filter(
    (route) => !ROBOTS_DISALLOW_PREFIXES.some((prefix) => route === prefix || route.startsWith(`${prefix}/`)),
  );
  const urlEntries = publicRoutes.map((route) => {
    const loc = route === "/" ? `${siteBase}/` : `${siteBase}${route}/`;
    const priority = route === "/" ? "1.0" : route.split("/").length <= 2 ? "0.8" : "0.6";
    return `  <url><loc>${loc}</loc><changefreq>weekly</changefreq><priority>${priority}</priority></url>`;
  });
  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${urlEntries.join("\n")}\n` +
    `</urlset>\n`;
  fs.writeFileSync(path.join(distDir, "sitemap.xml"), sitemap, "utf8");
}

const SITE_ROUTE_GUARD_PATTERNS = Object.freeze([
  { s: "^/users?/\\d{17,20}$", f: "" },
  { s: "^/users/\\d{17,20}/customize$", f: "" },
  { s: "^/user/\\d{17,20}/personalizza$", f: "" },
]);

const SITE_ROUTE_GUARD_HIDDEN_DEFAULTS = Object.freeze(["/seratafilm/accesso-richiesto"]);

function buildSiteRouteGuardBoot(routesPayload) {
  const json = JSON.stringify(routesPayload).replace(/</g, "\\u003c");
  return (
    `    <script>window.__VC_SITE_ROUTES=${json};</script>\n` +
    `    <script src="/js/vc-site-route-guard.js" defer></script>\n`
  );
}

function applySiteRouteGuardToHtml(html, routeGuardBoot) {
  if (!routeGuardBoot || html.includes("window.__VC_SITE_ROUTES")) return html;
  // Keep Open Graph / Twitter meta first in <head> for link-preview crawlers
  // (WhatsApp/Slack often stop parsing after early scripts).
  if (html.includes("</head>")) {
    return html.replace("</head>", `${routeGuardBoot}  </head>`);
  }
  const headOpen = html.match(/<head\b[^>]*>/i);
  if (headOpen) {
    return html.replace(headOpen[0], `${headOpen[0]}\n${routeGuardBoot}`);
  }
  return routeGuardBoot + html;
}

function applySiteRouteGuardToDist(distDir, cfg) {
  const paths = collectDistHtmlRoutes(distDir);
  const siteRoutesRaw = cfg.siteRoutes && typeof cfg.siteRoutes === "object" ? cfg.siteRoutes : {};
  const hiddenFromCfg = Array.isArray(siteRoutesRaw.hiddenPaths)
    ? siteRoutesRaw.hiddenPaths.map((p) => String(p || "").trim()).filter(Boolean)
    : [];
  const hidden = [...new Set([...SITE_ROUTE_GUARD_HIDDEN_DEFAULTS, ...hiddenFromCfg])].map((p) => {
    const s = p.replace(/\/+$/, "") || "/";
    return s.startsWith("/") ? s : `/${s}`;
  });
  const aliasesRaw = siteRoutesRaw.aliases && typeof siteRoutesRaw.aliases === "object"
    ? siteRoutesRaw.aliases
    : {};
  const aliases = {};
  for (const [from, to] of Object.entries(aliasesRaw)) {
    const src = String(from || "").trim().replace(/\/+$/, "") || "/";
    const dest = String(to || "").trim();
    if (!dest) continue;
    aliases[src.startsWith("/") ? src : `/${src}`] = dest;
  }
  const payload = {
    home: "/",
    paths,
    patterns: SITE_ROUTE_GUARD_PATTERNS,
    hidden,
    aliases,
  };
  const boot = buildSiteRouteGuardBoot(payload);
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (!name.toLowerCase().endsWith(".html")) continue;
      const html = fs.readFileSync(p, "utf8");
      const next = applySiteRouteGuardToHtml(html, boot);
      if (next !== html) fs.writeFileSync(p, next, "utf8");
    }
  };
  walk(distDir);
}

function relativeScriptPrefixFromHtml(absHtmlPath) {
  const relDir = path.relative(path.dirname(absHtmlPath), DIST).replace(/\\/g, "/");
  if (!relDir || relDir === ".") return "";
  return relDir.endsWith("/") ? relDir : `${relDir}/`;
}

function applyHeaderPromoToHtml(html, { promoButtonHtml, promoBootHtml }) {
  if (!html.includes('id="header-quick-actions"')) return html;
  let next = html;
  if (promoButtonHtml && !next.includes('id="vc-header-promo-btn"')) {
    next = next.replace(
      /(<div[^>]*id="header-quick-actions"[^>]*>)/i,
      `$1\n          ${promoButtonHtml}`,
    );
  }
  if (promoBootHtml && !next.includes("vc-header-promo.js")) {
    if (next.includes("</body>")) next = next.replace("</body>", `${promoBootHtml}\n</body>`);
    else if (next.includes("</head>")) next = next.replace("</head>", `${promoBootHtml}\n</head>`);
    else next += `\n${promoBootHtml}`;
  }
  return next;
}

function applyHeaderPromoToDist(distDir, promoButtonHtml, headerPromoClientConfig) {
  const { buildHeaderPromoBootHtml } = require(path.join(ROOT, "..", "Vinyls", "Utils", "Web", "hogwartsEventCalendar.js"));
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (!name.toLowerCase().endsWith(".html")) continue;
      const html = fs.readFileSync(p, "utf8");
      const rel = path.relative(distDir, p).replace(/\\/g, "/").toLowerCase();
      if (html.includes("vc-dashboard-page") || rel.startsWith("dashboard/")) {
        continue;
      }
      const scriptPrefix = relativeScriptPrefixFromHtml(p);
      const promoBootHtml = buildHeaderPromoBootHtml(headerPromoClientConfig, scriptPrefix);
      const next = applyHeaderPromoToHtml(html, { promoButtonHtml, promoBootHtml });
      if (next !== html) fs.writeFileSync(p, next, "utf8");
    }
  };
  walk(distDir);
}

function applyLiveStatsBootToDist(distDir, cfg, inviteCode) {
  const ls = cfg && cfg.liveStats && typeof cfg.liveStats === "object" ? cfg.liveStats : {};
  if (ls.enabled === false) return;
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (!name.toLowerCase().endsWith(".html")) continue;
      const html = fs.readFileSync(p, "utf8");
      if (html.includes("window.__VC_DISABLE_LIVE_EVENT_UI = true") || html.includes("vc-hw-page") || html.includes("vc-seratafilm-page")) continue;
      const rel = path.relative(distDir, p).replace(/\\/g, "/").toLowerCase();
      if (html.includes("vc-dashboard-page") || rel.startsWith("dashboard/")) continue;
      if (html.includes("window.__VC_LIVE") || html.includes("js/live-stats.js")) continue;
      const scriptPrefix = relativeScriptPrefixFromHtml(p);
      const boot = buildLiveStatsBootHtml(cfg, inviteCode, { scriptPrefix });
      if (!boot) continue;
      let next = html;
      if (next.includes("</body>")) next = next.replace("</body>", `${boot}  </body>`);
      else if (next.includes("</head>")) next = next.replace("</head>", `${boot}  </head>`);
      else next += `\n${boot}`;
      if (next !== html) fs.writeFileSync(p, next, "utf8");
    }
  };
  walk(distDir);
}

function applyAvatarFallbackToDist(distDir, assetVersion = "") {
  const suffix = assetVersion ? `?v=${encodeURIComponent(String(assetVersion))}` : "";
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (!name.toLowerCase().endsWith(".html")) continue;
      const html = fs.readFileSync(p, "utf8");
      if (html.includes("vc-avatar-fallback.js")) continue;
      const scriptPrefix = relativeScriptPrefixFromHtml(p);
      const boot = `  <script src="${scriptPrefix}js/vc-avatar-fallback.js${suffix}" defer></script>\n`;
      let next = html;
      if (next.includes("</body>")) next = next.replace("</body>", `${boot}  </body>`);
      else if (next.includes("</head>")) next = next.replace("</head>", `${boot}  </head>`);
      else next += `\n${boot}`;
      if (next !== html) fs.writeFileSync(p, next, "utf8");
    }
  };
  walk(distDir);
}

function applyEmojiRenderToDist(distDir, assetVersion = "") {
  const suffix = assetVersion ? `?v=${encodeURIComponent(String(assetVersion))}` : "";
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (!name.toLowerCase().endsWith(".html")) continue;
      const html = fs.readFileSync(p, "utf8");
      if (html.includes("vc-emoji-render.js")) continue;
      const scriptPrefix = relativeScriptPrefixFromHtml(p);
      const boot = `  <script src="${scriptPrefix}js/vc-emoji-render.js${suffix}" defer></script>\n`;
      let next = html;
      if (next.includes("vc-avatar-fallback.js")) {
        next = next.replace(
          /(<script[^>]*vc-avatar-fallback\.js[^>]*><\/script>)/i,
          `$1\n${boot.trimEnd()}`,
        );
      } else if (next.includes("</body>")) {
        next = next.replace("</body>", `${boot}  </body>`);
      } else if (next.includes("</head>")) {
        next = next.replace("</head>", `${boot}  </head>`);
      } else {
        next += `\n${boot}`;
      }
      if (next !== html) fs.writeFileSync(p, next, "utf8");
    }
  };
  walk(distDir);
}

function applyVcDialogToDist(distDir, assetVersion = "") {
  const suffix = assetVersion ? `?v=${encodeURIComponent(String(assetVersion))}` : "";
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (!name.toLowerCase().endsWith(".html")) continue;
      let html = fs.readFileSync(p, "utf8");
      if (html.includes("vc-dialog.js")) continue;
      const scriptPrefix = relativeScriptPrefixFromHtml(p);
      const boot = `  <script src="${scriptPrefix}js/vc-dialog.js${suffix}" defer></script>\n`;
      let next = html;
      if (next.includes("</body>")) next = next.replace("</body>", `${boot}  </body>`);
      else if (next.includes("</head>")) next = next.replace("</head>", `${boot}  </head>`);
      else next += `\n${boot}`;
      if (next !== html) fs.writeFileSync(p, next, "utf8");
    }
  };
  walk(distDir);
}

function applyCursorTrailToDist(distDir, assetVersion = "") {
  const suffix = assetVersion ? `?v=${encodeURIComponent(String(assetVersion))}` : "";
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (!name.toLowerCase().endsWith(".html")) continue;
      const html = fs.readFileSync(p, "utf8");
      if (html.includes("vc-cursor-trail.js")) continue;
      if (!html.includes("vc-landing.css") && !html.includes("discord-auth.js")) continue;
      const boot = `  <script src="/js/vc-cursor-trail.js${suffix}" defer></script>\n`;
      let next = html;
      if (next.includes("</body>")) next = next.replace("</body>", `${boot}  </body>`);
      else if (next.includes("</head>")) next = next.replace("</head>", `${boot}  </head>`);
      else next += `\n${boot}`;
      if (next !== html) fs.writeFileSync(p, next, "utf8");
    }
  };
  walk(distDir);
}

function applyTypeSfxToDist(distDir, assetVersion = "") {
  const suffix = assetVersion ? `?v=${encodeURIComponent(String(assetVersion))}` : "";
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (!name.toLowerCase().endsWith(".html")) continue;
      const html = fs.readFileSync(p, "utf8");
      if (html.includes("vc-type-sfx.js")) continue;
      if (
        !html.includes("vc-landing.css") &&
        !html.includes("vc-cursor-trail.js") &&
        !html.includes("discord-auth.js")
      ) {
        continue;
      }
      const boot =
        `  <script src="/js/vc-chrome-sync.js${suffix}" defer></script>\n` +
        `  <script src="/js/vc-type-sfx.js${suffix}" defer></script>\n`;
      let next = html;
      if (next.includes("</body>")) next = next.replace("</body>", `${boot}  </body>`);
      else if (next.includes("</head>")) next = next.replace("</head>", `${boot}  </head>`);
      else next += `\n${boot}`;
      if (next !== html) fs.writeFileSync(p, next, "utf8");
    }
  };
  walk(distDir);
}

function applyPtrToDist(distDir, assetVersion = "") {
  const suffix = assetVersion ? `?v=${encodeURIComponent(String(assetVersion))}` : "";
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (!name.toLowerCase().endsWith(".html")) continue;
      const html = fs.readFileSync(p, "utf8");
      if (html.includes("vc-ptr.js")) continue;
      if (
        !html.includes("vc-landing.js") &&
        !html.includes("vc-landing.css") &&
        !html.includes("vc-cursor-trail.js") &&
        !html.includes("discord-auth.js") &&
        !html.includes("vc-dashboard-page") &&
        !html.includes("vc-seratafilm-page") &&
        !html.includes("vc-staff-area") &&
        !html.includes("vc-staff-route") &&
        !html.includes("staff-access-gate.js") &&
        !html.includes("staff-tools-common.js")
      ) {
        continue;
      }
      const boot = `  <script src="/js/vc-ptr.js${suffix}" defer></script>\n`;
      let next = html;
      if (next.includes("</body>")) next = next.replace("</body>", `${boot}  </body>`);
      else if (next.includes("</head>")) next = next.replace("</head>", `${boot}  </head>`);
      else next += `\n${boot}`;
      if (next !== html) fs.writeFileSync(p, next, "utf8");
    }
  };
  walk(distDir);
}

function applyMobileNavToDist(distDir, assetVersion = "") {
  const suffix = assetVersion ? `?v=${encodeURIComponent(String(assetVersion))}` : "";
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (!name.toLowerCase().endsWith(".html")) continue;
      const html = fs.readFileSync(p, "utf8");
      if (html.includes("vc-mobile-nav.js")) continue;
      if (!html.includes("vc-mobile-nav-toggle") && !html.includes("header-quick-actions")) continue;
      const boot = `  <script src="/js/vc-mobile-nav.js${suffix}" defer></script>\n`;
      let next = html;
      if (next.includes("vc-landing.js")) {
        next = next.replace(
          /(<script[^>]*src="[^"]*vc-landing\.js[^"]*"[^>]*><\/script>)/i,
          `$1\n${boot.trimEnd()}`,
        );
      } else if (next.includes("</body>")) {
        next = next.replace("</body>", `${boot}  </body>`);
      } else {
        next += `\n${boot}`;
      }
      if (next !== html) fs.writeFileSync(p, next, "utf8");
    }
  };
  walk(distDir);
}

function applyHeaderNameMarqueeToDist(distDir, assetVersion = "") {
  const suffix = assetVersion ? `?v=${encodeURIComponent(String(assetVersion))}` : "";
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (!name.toLowerCase().endsWith(".html")) continue;
      let html = fs.readFileSync(p, "utf8");
      if (html.includes("vc-header-name-marquee.js")) continue;
      if (!html.includes("vc-header-bar") && !html.includes("vc-landing.css")) continue;
      const boot = `  <script src="/js/vc-header-name-marquee.js${suffix}" defer></script>\n`;
      let next = html;
      if (next.includes("</body>")) next = next.replace("</body>", `${boot}  </body>`);
      else if (next.includes("</head>")) next = next.replace("</head>", `${boot}  </head>`);
      else next += `\n${boot}`;
      if (next !== html) fs.writeFileSync(p, next, "utf8");
    }
  };
  walk(distDir);
}

function buildLangSwitcherHtml() {
  return `<div class="vc-lang-dropdown" id="vc-lang-dropdown">
              <button type="button" class="vc-lang-toggle" id="vc-lang-toggle" aria-label="Lingua" aria-haspopup="listbox" aria-expanded="false" data-i18n-attr="aria-label:nav.language"><span class="vc-lang-flag vc-lang-flag--it" id="vc-lang-flag" data-vc-lang-flag="it" aria-hidden="true"></span></button>
              <div class="vc-lang-panel" id="vc-lang-panel" role="listbox" hidden aria-label="Scegli lingua" data-i18n-attr="aria-label:nav.languageList">
                <button type="button" class="vc-lang-option" data-vc-lang="it" role="option" aria-selected="true"><span class="vc-lang-flag vc-lang-flag--it" aria-hidden="true"></span><span data-i18n="lang.it">Italiano</span></button>
                <button type="button" class="vc-lang-option" data-vc-lang="en" role="option" aria-selected="false"><span class="vc-lang-flag vc-lang-flag--en" aria-hidden="true"></span><span data-i18n="lang.en">English</span></button>
              </div>
            </div>`;
}

function stripLangSwitcherHtml(html) {
  let next = String(html || "");
  next = next.replace(/<details\b[^>]*\bid=["']vc-lang-dropdown["'][^>]*>[\s\S]*?<\/details>\s*/gi, "");
  const startRe = /<div\b[^>]*\bid=["']vc-lang-dropdown["'][^>]*>/i;
  const startMatch = startRe.exec(next);
  if (!startMatch) return next;
  const start = startMatch.index;
  let i = start + startMatch[0].length;
  let depth = 1;
  while (i < next.length && depth > 0) {
    const open = next.slice(i).search(/<div\b/i);
    const close = next.slice(i).search(/<\/div>/i);
    if (close < 0) break;
    if (open >= 0 && open < close) {
      depth += 1;
      i += open + 4;
      continue;
    }
    depth -= 1;
    i += close + 6;
  }
  if (depth !== 0) return next;
  let end = i;
  while (end < next.length && /\s/.test(next[end])) end += 1;
  return next.slice(0, start) + next.slice(end);
}

function injectLangSwitcherNearBrand(html) {
  let next = stripLangSwitcherHtml(html);
  if (next.includes('id="vc-lang-dropdown"')) return next;
  const switcher = buildLangSwitcherHtml();
  const brandColRes = [
    /(<div class="flex min-w-0 items-center gap-2\.5 justify-self-start sm:gap-3">)([\s\S]*?)(<\/div>\s*(?:<nav\b|<div[^>]*id="header-quick-actions"))/i,
    /(<div class="flex min-w-0 items-center gap-2(?:\.5)?[^"]*"[^>]*>)([\s\S]*?)(<\/div>\s*(?:<nav\b|<div[^>]*id="header-quick-actions"))/i,
  ];
  for (const brandColRe of brandColRes) {
    if (!brandColRe.test(next)) continue;
    next = next.replace(brandColRe, (_, open, inner, close) => {
      const trimmed = String(inner).replace(/\s+$/, "");
      const siteNameRe = /(<a\b[^>]*class="[^"]*vc-header-site-name[^"]*"[^>]*>[\s\S]*?<\/a>)/i;
      const siteNameMatch = siteNameRe.exec(trimmed);
      if (siteNameMatch) {
        const idx = siteNameMatch.index + siteNameMatch[0].length;
        return `${open}${trimmed.slice(0, idx)}\n            ${switcher}${trimmed.slice(idx)}\n          ${close}`;
      }
      return `${open}${trimmed}\n            ${switcher}\n          ${close}`;
    });
    return next;
  }
  return next;
}

function stripBotReviewsFromPublicNav(html) {
  if (!html || typeof html !== "string") return html;
  return html.replace(
    /\s*<a class="vc-snav-row(?:\s+vc-snav-row--active)?" href="\{\{BOT_REVIEWS_PAGE_URL\}\}"[\s\S]*?<\/a>/g,
    "",
  );
}

function annotateSharedChromeI18n(html) {
  let next = stripBotReviewsFromPublicNav(html);
  const spanSubs = [
    [/>\s*<span>\s*Wiki\s*<\/span>/gi, '><span data-i18n="nav.wiki">Wiki</span>'],
    [/>\s*<span>\s*Sponsor\s*<\/span>/gi, '><span data-i18n="nav.sponsor">Sponsor</span>'],
    [/<summary class="vc-snav-summary"><span>Supporta<\/span>/g, '<summary class="vc-snav-summary"><span data-i18n="nav.support">Supporta</span>'],
    [/<summary class="vc-snav-summary"><span>Community<\/span>/g, '<summary class="vc-snav-summary"><span data-i18n="nav.community">Community</span>'],
    [/<summary class="vc-snav-summary"><span>Richieste<\/span>/g, '<summary class="vc-snav-summary"><span data-i18n="nav.requests">Richieste</span>'],
    [/<span>Vota il server<\/span>/g, '<span data-i18n="nav.voteServer">Vota il server</span>'],
    [/<span>Recensioni<\/span>/g, '<span data-i18n="nav.reviews">Recensioni</span>'],
    [/<span>Recensioni<\/span>/g, '<span data-i18n="nav.botReviews">Recensioni</span>'],
    [/<span>Donazioni<\/span>/g, '<span data-i18n="nav.donations">Donazioni</span>'],
    [/<span>Perks<\/span>/g, '<span data-i18n="nav.perks">Perks</span>'],
    [/<span>Users<\/span>/g, '<span data-i18n="nav.users">Users</span>'],
    [/<span>Ruoli<\/span>/g, '<span data-i18n="nav.roles">Ruoli</span>'],
    [/<span>Regole<\/span>/g, '<span data-i18n="nav.rules">Regole</span>'],
    [/<span>FAQ<\/span>/g, '<span data-i18n="nav.faq">FAQ</span>'],
    [/<span>Unban<\/span>/g, '<span data-i18n="nav.unban">Unban</span>'],
    [/<span>Candidature<\/span>/g, '<span data-i18n="nav.applications">Candidature</span>'],
    [/<span>Suggerimenti<\/span>/g, '<span data-i18n="nav.suggestions">Suggerimenti</span>'],
    [/<span>Ticket<\/span>/g, '<span data-i18n="nav.tickets">Tickets</span>'],
    [/<span>Tickets<\/span>/g, '<span data-i18n="nav.tickets">Tickets</span>'],
    [/<span>tickets<\/span>/g, '<span data-i18n="nav.tickets">Tickets</span>'],
    [/<span>Supporto<\/span>/g, '<span data-i18n="nav.tickets">Tickets</span>'],
    [/<span>Status<\/span>/g, '<span data-i18n="nav.status">Status</span>'],
  ];
  for (const [re, rep] of spanSubs) {
    next = next.replace(re, rep);
  }
  // Icona biglietto al posto della chat per il link tickets/supporto.
  next = next.replace(
    /(<a class="vc-snav-row(?:\s+vc-snav-row--active)?" href="\{\{(?:TICKETS_PAGE_URL|SUPPORTO_PAGE_URL)\}\}"[^>]*>[\s\S]*?<i class=")fa fa-comments-o(")/g,
    "$1fa fa-ticket$2",
  );
  next = next.replace(
    /aria-label="Collegamenti rapidi"/g,
    'aria-label="Collegamenti rapidi" data-i18n-attr="aria-label:nav.quickLinks"',
  );
  next = next.replace(
    /aria-label="Entra su Discord"/g,
    'aria-label="Entra su Discord" data-i18n-attr="aria-label:nav.discordAria"',
  );
  next = next.replace(
    /aria-label="Vai alla homepage"(?: data-i18n-attr="aria-label:nav.homeAria")?/g,
    "",
  );
  next = next.replace(
    /(<summary class="vc-icon-btn vc-notif-summary[^"]*" aria-label=")Notifiche(")/g,
    '$1Notifiche$2 data-i18n-attr="aria-label:notif.aria"',
  );
  next = next.replace(
    /aria-label="Elenco notifiche"/g,
    'aria-label="Elenco notifiche" data-i18n-attr="aria-label:notif.listAria"',
  );
  next = next.replace(
    /<span class="vc-notif-panel-title">Notifiche<\/span>/g,
    '<span class="vc-notif-panel-title" data-i18n="notif.title">Notifiche</span>',
  );
  next = next.replace(
    /id="vc-notif-unread-sub">0 non lette<\/span>/g,
    'id="vc-notif-unread-sub" data-i18n="notif.unreadZero">0 non lette</span>',
  );
  next = next.replace(
    /id="vc-notif-mark-all" title="Segna tutte come lette"\s*aria-label="Segna tutte come lette"/g,
    'id="vc-notif-mark-all" title="Segna tutte come lette" aria-label="Segna tutte come lette" data-i18n-title="notif.markAll" data-i18n-attr="aria-label:notif.markAll"',
  );
  next = next.replace(
    /id="vc-notif-clear-all" title="Elimina tutte"\s*aria-label="Elimina tutte"/g,
    'id="vc-notif-clear-all" title="Elimina tutte" aria-label="Elimina tutte" data-i18n-title="notif.clearAll" data-i18n-attr="aria-label:notif.clearAll"',
  );
  next = next.replace(
    /<p class="vc-notif-empty-title">Nessuna notifica<\/p>/g,
    '<p class="vc-notif-empty-title" data-i18n="notif.emptyTitle">Nessuna notifica</p>',
  );
  next = next.replace(
    /<p class="vc-notif-empty-sub">Sei tutto aggiornato!<\/p>/g,
    '<p class="vc-notif-empty-sub" data-i18n="notif.emptySub">Sei tutto aggiornato!</p>',
  );
  next = next.replace(
    /(id="vc-notif-see-all"[^>]*>)Vedi tutte le notifiche/g,
    '$1<span data-i18n="notif.seeAll">Vedi tutte le notifiche</span>',
  );
  next = next.replace(
    /(<button class="vc-header-pill" id="discord-login-btn"[^>]*>)Login(<\/button>)/g,
    '$1<span data-i18n="auth.login">Login</span>$2',
  );
  next = next.replace(
    /(<button class="vc-header-pill" id="discord-login-btn"[^>]*data-vc-discord-login[^>]*>)Login(<\/button>)/g,
    '$1<span data-i18n="auth.login">Login</span>$2',
  );
  next = next.replace(
    /(<i class="fa fa-save"[^>]*><\/i>)\s*Salva/g,
    '$1 <span data-i18n="dash.save">Salva</span>',
  );
  next = next.replace(
    /(<i class="fa fa-cog"[^>]*><\/i>)\s*Impostazioni/g,
    '$1 <span data-i18n="dash.settings">Impostazioni</span>',
  );
  next = next.replace(
    /<span class="vc-dash-picker__label">Seleziona canale<\/span>/g,
    '<span class="vc-dash-picker__label" data-i18n="dash.selectChannel">Seleziona canale</span>',
  );
  next = next.replace(
    /<span class="vc-dash-picker__label">Seleziona ruolo<\/span>/g,
    '<span class="vc-dash-picker__label" data-i18n="dash.selectRole">Seleziona ruolo</span>',
  );
  return next;
}

function applyI18nToHtml(html, { scriptPrefix = "", assetSuffix = "" } = {}) {
  if (!html.includes("vc-landing.css") && !html.includes("vc-dashboard-page")) return html;
  let next = injectLangSwitcherNearBrand(html);
  next = annotateSharedChromeI18n(next);
  if (next.includes("vc-i18n.js")) return next;
  const boot =
    `  <script>(function(){try{var l=String(localStorage.getItem("vc_site_lang")||"").toLowerCase();var ok=["it","en","es","fr","de","pt","ru","zh","ja","ko","ar","nl","pl","tr","hi","id","uk","vi","ro","sv"];if(ok.indexOf(l)>=0){document.documentElement.lang=l;document.documentElement.setAttribute("dir",l==="ar"?"rtl":"ltr");}}catch(e){}})();</script>\n` +
    `  <script src="${scriptPrefix}js/vc-i18n.js${assetSuffix}" defer></script>\n` +
    `  <script src="${scriptPrefix}js/vc-i18n-pages.js${assetSuffix}" defer></script>\n` +
    `  <script src="${scriptPrefix}js/vc-i18n-pages-extra.js${assetSuffix}" defer></script>\n` +
    `  <script src="${scriptPrefix}js/vc-i18n-locales.js${assetSuffix}" defer></script>\n`;
  if (next.includes("</head>")) next = next.replace("</head>", `${boot}</head>`);
  else if (next.includes("</body>")) next = next.replace("</body>", `${boot}</body>`);
  else next += `\n${boot}`;
  return next;
}

function ensureI18nPagesScript(html, { scriptPrefix = "", assetSuffix = "" } = {}) {
  if (!html.includes("vc-i18n.js")) return html;
  let next = html;
  if (!next.includes("vc-i18n-pages.js")) {
    const tag = `  <script src="${scriptPrefix}js/vc-i18n-pages.js${assetSuffix}"></script>\n`;
    if (next.includes("js/vc-i18n.js")) {
      next = next.replace(
        /(<script[^>]*js\/vc-i18n\.js[^>]*><\/script>)/i,
        `$1\n${tag}`,
      );
    }
  }
  if (!next.includes("vc-i18n-pages-extra.js") && next.includes("vc-i18n-pages.js")) {
    const extra = `  <script src="${scriptPrefix}js/vc-i18n-pages-extra.js${assetSuffix}"></script>\n`;
    next = next.replace(
      /(<script[^>]*js\/vc-i18n-pages\.js[^>]*><\/script>)/i,
      `$1\n${extra}`,
    );
  }
  if (!next.includes("vc-i18n-locales.js") && next.includes("vc-i18n-pages-extra.js")) {
    const locales = `  <script src="${scriptPrefix}js/vc-i18n-locales.js${assetSuffix}"></script>\n`;
    next = next.replace(
      /(<script[^>]*js\/vc-i18n-pages-extra\.js[^>]*><\/script>)/i,
      `$1\n${locales}`,
    );
  } else if (!next.includes("vc-i18n-locales.js") && next.includes("vc-i18n-pages.js")) {
    const locales = `  <script src="${scriptPrefix}js/vc-i18n-locales.js${assetSuffix}"></script>\n`;
    next = next.replace(
      /(<script[^>]*js\/vc-i18n-pages\.js[^>]*><\/script>)/i,
      `$1\n${locales}`,
    );
  }
  return next;
}

function applyI18nToDist(distDir, assetVersion = "") {
  const suffix = assetVersion ? `?v=${encodeURIComponent(String(assetVersion))}` : "";
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (!name.toLowerCase().endsWith(".html")) continue;
      const html = fs.readFileSync(p, "utf8");
      const scriptPrefix = relativeScriptPrefixFromHtml(p);
      let next = applyI18nToHtml(html, { scriptPrefix, assetSuffix: suffix });
      next = ensureI18nPagesScript(next, { scriptPrefix, assetSuffix: suffix });
      if (next !== html) fs.writeFileSync(p, next, "utf8");
    }
  };
  walk(distDir);
}

async function buildStaffListBlock(cfg, guildId) {
  const b = cfg.discordStaffListBuild;
  if (!b || b.enabled !== true) return staffListFallback();
  if (envFlagTrue("VC_BUILD_FAST") && b.alwaysFetchStaffListInFastBuild !== true) {
    buildInfoLog(
      "[build-site] VC_BUILD_FAST: salto download membri per la staff list (HTML fallback; build pieno senza VC_BUILD_FAST per lista reale).",
    );
    return staffListFallback();
  }
  const gid = String(guildId || b.guildId || "").trim();
  const botToken = process.env.DISCORD_WEBSITE_BUILD_BOT_TOKEN?.trim();
  if (!gid || !botToken) {
    console.warn(
      "[build-site] Staff list: servono guildId (o invite per ricavarlo) e la variabile DISCORD_WEBSITE_BUILD_BOT_TOKEN.",
    );
    return staffListFallback();
  }

  const staffRoleIds = new Set(
    (Array.isArray(b.staffRoleIds) ? b.staffRoleIds : []).map((x) => String(x).trim()).filter(Boolean),
  );
  const rawEx = b.excludeFromStaffListRoleIds;
  const excludeRoleIds = new Set(
    rawEx === undefined
      ? ["1442568905582317740"]
      : (Array.isArray(rawEx) ? rawEx : []).map((x) => String(x).trim()).filter(Boolean),
  );

  if (!staffRoleIds.size) {
    console.warn("[build-site] discordStaffListBuild.staffRoleIds vuoto.");
    return staffListFallback();
  }

  const { ok: roleMetasFetchOk, map: roleMetas } = await fetchGuildRoleMetas(gid, botToken);
  const ownerUserId = await fetchGuildOwnerId(gid, botToken);
  if (roleMetasFetchOk) {
    for (const rid of staffRoleIds) {
      if (!roleMetas.has(rid)) {
        console.warn("[build-site] staffRoleIds: ruolo non trovato in guild (ID errato o ruolo rimosso):", rid);
      }
    }
  } else {
    console.warn(
      "[build-site] staffRoleIds: controllo presenza ruoli saltato (elenco ruoli guild non scaricato; spesso 502/503 temporaneo di Discord).",
    );
  }

  const maxScan = Number.isFinite(Number(b.maxMembersToScan)) ? Number(b.maxMembersToScan) : 10000;
  const [members, staffStatusFlags] = await Promise.all([
    fetchGuildMembersUpTo(gid, botToken, maxScan),
    fetchStaffListStatusFlags(gid),
  ]);
  if (!members.length) {
    console.warn("[build-site] Nessun membro scaricato per la staff list.");
    return staffListFallback();
  }
  if (members.length >= maxScan) {
    console.warn(
      "[build-site] Staff list: raggiunto maxMembersToScan=",
      maxScan,
      "; possibili membri non scansionati. Aumenta maxMembersToScan in site.config.json.",
    );
  }

  const labelOverrides =
    b.staffRoleLabels && typeof b.staffRoleLabels === "object" && !Array.isArray(b.staffRoleLabels)
      ? b.staffRoleLabels
      : {};
  const staffRoleCdnEmojiByRoleId =
    b.staffRoleCdnEmojiByRoleId &&
    typeof b.staffRoleCdnEmojiByRoleId === "object" &&
    !Array.isArray(b.staffRoleCdnEmojiByRoleId)
      ? b.staffRoleCdnEmojiByRoleId
      : {};
  function staffRoleIconHtml(roleId) {
    const eid = String(staffRoleCdnEmojiByRoleId[roleId] ?? staffRoleCdnEmojiByRoleId[String(roleId)] ?? "").trim();
    if (!/^\d{5,25}$/.test(eid)) return "";
    const src = `https://cdn.discordapp.com/emojis/${eid}.webp?size=48&quality=lossless`;
    return `<span class="vc-staff-role-ico" aria-hidden="true"><img src="${escAttr(src)}" alt="" width="20" height="20" loading="lazy" decoding="async" /></span>`;
  }
  const displayOrder = Array.isArray(b.staffRoleDisplayOrder)
    ? b.staffRoleDisplayOrder.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const showEachRole = b.staffListShowEachRole === true;
  const showEmptyRoles = b.showEmptyStaffRoles !== false;
  const pmRoleId = String(b.partnerManagerRoleId || "1442568905582317740").trim();
  const communityManagerRoleId = String(b.communityManagerRoleId || "1494089487863644330").trim();

  function resolveRoleLabel(roleId, fallbackLabel) {
    const rid = String(roleId || "").trim();
    const fallback = String(fallbackLabel || "").trim() || rid || "Staff";
    const rawLabel = roleMetas.get(rid)?.name || fallback;
    return String(labelOverrides[rid] ?? labelOverrides[String(rid)] ?? rawLabel).trim() || rawLabel;
  }

  for (const id of staffRoleIds) {
    if (excludeRoleIds.has(id)) {
      console.warn(
        "[build-site] excludeFromStaffListRoleIds contiene un ID presente anche in staffRoleIds (conflitto). Rimuovilo da uno dei due elenchi:",
        id,
      );
    }
  }

  const ladderIds =
    displayOrder.length > 0
      ? displayOrder
      : [...staffRoleIds].sort(
          (a, b) =>
            (roleMetas.get(b)?.position ?? 0) - (roleMetas.get(a)?.position ?? 0),
        );

  function pickStaffBucketRoleId(rids) {
    const rset = new Set(rids);
    if (displayOrder.length > 0) {
      for (const rid of displayOrder) {
        if (excludeRoleIds.has(rid)) continue;
        if (!staffRoleIds.has(rid)) continue;
        if (rset.has(rid)) return rid;
      }
    }
    let bestId = null;
    let bestPos = -999999;
    for (const rid of rids) {
      if (excludeRoleIds.has(rid)) continue;
      if (!staffRoleIds.has(rid)) continue;
      const meta = roleMetas.get(rid);
      const pos = meta ? Number(meta.position) : 0;
      if (pos > bestPos) {
        bestPos = pos;
        bestId = rid;
      }
    }
    return bestId;
  }

  const rows = [];
  for (const m of members) {
    if (m?.user?.bot) continue;
    const rids = memberRoleIds(m);
    if (showEachRole) {
      const seenRid = new Set();
      for (const rid of rids) {
        if (excludeRoleIds.has(rid)) continue;
        if (!staffRoleIds.has(rid)) continue;
        if (seenRid.has(rid)) continue;
        seenRid.add(rid);
        const bestPos = roleMetas.get(rid)?.position ?? 0;
        const roleLabel = resolveRoleLabel(rid, rid);
        rows.push({ bestId: rid, bestPos, roleLabel, m });
      }
      continue;
    }
    const bestId = pickStaffBucketRoleId(rids);
    if (!bestId) continue;
    const bestPos = roleMetas.get(bestId)?.position ?? 0;
    const roleLabel = resolveRoleLabel(bestId, bestId);
    rows.push({ bestId, bestPos, roleLabel, m });
  }

  const humans = members.filter((m) => m?.user && !m.user.bot).length;
  const withStaff = new Set(
    rows.map((r) => String(r.m?.user?.id || "")).filter(Boolean),
  ).size;
  buildInfoLog(
    "[build-site] Staff list:",
    members.length,
    "membri scaricati (",
    humans,
    "umani),",
    withStaff,
    "con almeno un ruolo in staffRoleIds,",
    rows.length,
    showEachRole ? "righe (una per ruolo staff)." : "righe (una persona = una fascia).",
  );

  if (!rows.length) {
    console.warn("[build-site] Staff list: nessun membro dopo filtri (ruoli o intent).");
    return {
      ...staffListFallback(),
      maintenanceBypassUserIds: maintenanceBypassUserIdsFromMembers(members, botIds.websiteMaintenanceBypassRoleIds),
    };
  }

  const byRole = new Map();
  for (const row of rows) {
    if (!byRole.has(row.bestId)) {
      byRole.set(row.bestId, {
        roleId: row.bestId,
        roleLabel: row.roleLabel,
        bestPos: row.bestPos,
        members: [],
      });
    }
    const g = byRole.get(row.bestId);
    const uid = String(row.m?.user?.id || "");
    if (uid && g.members.some((x) => String(x?.user?.id || "") === uid)) continue;
    g.members.push(row.m);
  }

  if (showEmptyRoles) {
    for (const roleId of ladderIds) {
      if (!staffRoleIds.has(roleId)) continue;
      if (excludeRoleIds.has(roleId)) continue;
      if (byRole.has(roleId)) continue;
      const roleLabel = resolveRoleLabel(roleId, roleId);
      byRole.set(roleId, {
        roleId,
        roleLabel,
        bestPos: roleMetas.get(roleId)?.position ?? -999999,
        members: [],
      });
    }
  }

  const groups = [...byRole.values()].filter((g) => !isGenericStaffRoleLabel(g?.roleLabel));
  groups.sort((a, b) => {
    const ia = ladderIds.indexOf(a.roleId);
    const ib = ladderIds.indexOf(b.roleId);
    const aKnown = ia !== -1;
    const bKnown = ib !== -1;
    if (aKnown && bKnown && ia !== ib) return ia - ib;
    if (aKnown && !bKnown) return -1;
    if (!aKnown && bKnown) return 1;
    return b.bestPos - a.bestPos;
  });
  for (const g of groups) {
    g.members.sort((ma, mb) =>
      memberStaffDisplayName(ma, ownerUserId).localeCompare(memberStaffDisplayName(mb, ownerUserId), "it", {
        sensitivity: "base",
      }),
    );
  }

  const roleLines = groups
    .map((g) => {
      const parts = g.members.length
        ? g.members
            .map((mem) => {
              const name = escHtml(memberStaffDisplayName(mem, ownerUserId));
              const href = escAttr(memberStaffProfileHref(mem));
              const uid = String(mem?.user?.id || "").trim();
              const ownerB = isServerOwnerMember(mem, ownerUserId) ? ownerBadgeHtml() : "";
              const newB = staffStatusFlags.newRolesByUser.get(uid)?.has(String(g.roleId))
                ? staffNewBadgeHtml()
                : "";
              const pauseB = staffStatusFlags.paused.has(uid) ? staffPauseBadgeHtml() : "";
              const roleB = staffRoleBadgeHtml(g.roleLabel, g.roleId);
              const badgeBits = [ownerB, newB, pauseB, roleB].filter(Boolean).join("");
              const badges = badgeBits
                ? `<span class="vc-staff-member-chip__badges">${badgeBits}</span>`
                : "";
              return `<span class="vc-staff-member-chip"><a href="${href}">${name}</a>${badges}</span>`;
            })
            .join(" | ")
        : "—";
      const icon = staffRoleIconHtml(g.roleId);
      return `            <p class="vc-staff-block__line">${icon}<span class="vc-staff-block__line-rest"><strong>${escHtml(g.roleLabel)}:</strong> ${parts}</span></p>`;
    })
    .join("\n");

  const html = `          <div class="vc-staff-block">\n${roleLines}\n          </div>`;
  const countedStaffUserIds = new Set(rows.map((r) => String(r.m?.user?.id || "")).filter(Boolean));
  const pmRoleLabel = resolveRoleLabel(pmRoleId, String(b.partnerManagerRoleLabel || "Partner Manager").trim());
  const communityManagerRoleLabel = resolveRoleLabel(
    communityManagerRoleId,
    String(b.communityManagerRoleLabel || "Community Manager").trim(),
  );
  const staffHoverGroups = groups
    .map((g) => ({
      roleId: String(g.roleId || "").trim(),
      role: String(g.roleLabel || "").trim(),
      members: g.members
        .map((mem) => {
          const uid = String(mem?.user?.id || "").trim();
          return staffHoverMemberPayload(mem, g.roleId, g.roleLabel, ownerUserId, gid, {
            isNew: staffStatusFlags.newRolesByUser.get(uid)?.has(String(g.roleId)) === true,
            isPaused: staffStatusFlags.paused.has(uid),
          });
        })
        .filter((mem) => mem.name),
    }))
    .filter((g) => g.role && Array.isArray(g.members) && g.members.length > 0);
  const existingHoverRoleIds = new Set(staffHoverGroups.map((g) => String(g.roleId || "").trim()).filter(Boolean));

  function appendRoleGroupIfMissing(targetRoleId, targetRoleLabel) {
    const rid = String(targetRoleId || "").trim();
    if (!rid || existingHoverRoleIds.has(rid)) return;
    const roleMembers = members
      .filter((m) => !m?.user?.bot)
      .filter((m) => memberRoleIds(m).includes(rid))
      .map((m) => {
        const uid = String(m?.user?.id || "").trim();
        return staffHoverMemberPayload(m, rid, targetRoleLabel, ownerUserId, gid, {
          isNew: staffStatusFlags.newRolesByUser.get(uid)?.has(rid) === true,
          isPaused: staffStatusFlags.paused.has(uid),
        });
      })
      .filter((m) => m.name)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "it", { sensitivity: "base" }));
    if (!roleMembers.length) return;
    staffHoverGroups.push({
      roleId: rid,
      role: String(targetRoleLabel || "").trim() || "Staff",
      members: roleMembers,
    });
    existingHoverRoleIds.add(rid);
  }

  if (pmRoleId) {
    for (const m of members) {
      if (!m?.user?.bot && memberRoleIds(m).includes(pmRoleId)) {
        const uid = String(m?.user?.id || "").trim();
        if (uid) countedStaffUserIds.add(uid);
      }
    }
    appendRoleGroupIfMissing(pmRoleId, pmRoleLabel);
  }
  if (communityManagerRoleId) {
    for (const m of members) {
      if (!m?.user?.bot && memberRoleIds(m).includes(communityManagerRoleId)) {
        const uid = String(m?.user?.id || "").trim();
        if (uid) countedStaffUserIds.add(uid);
      }
    }
    appendRoleGroupIfMissing(communityManagerRoleId, communityManagerRoleLabel);
  }
  const serverBoosterRoleId = String(b.serverBoosterRoleId || "1329497467481493607").trim();
  const doubleBoosterRoleId = String(b.doubleBoosterRoleId || "1494996567214788818").trim();
  const boosterRoleIds = new Set([serverBoosterRoleId, doubleBoosterRoleId].filter(Boolean));
  for (const [rid, meta] of roleMetas.entries()) {
    const name = String(meta?.name || "")
      .toLowerCase()
      .replace(/^༄\s*/, "")
      .trim();
    if (
      meta?.premiumSubscriber ||
      name === "server booster" ||
      name === "booster" ||
      name.includes("server booster")
    ) {
      boosterRoleIds.add(String(rid));
    }
  }
  let premiumSinceN = 0;
  let roleOnlyN = 0;
  const boostByUserId = new Map();
  for (const m of members) {
    if (m?.user?.bot) continue;
    const uid = String(m?.user?.id || "").trim();
    if (!uid) continue;
    const rids = memberRoleIds(m);
    const hasBoosterRole = rids.some((rid) => boosterRoleIds.has(String(rid)));
    const hasPremium = Boolean(m?.premium_since || m?.premiumSince);
    if (hasPremium) premiumSinceN += 1;
    else if (hasBoosterRole) roleOnlyN += 1;
    const isBooster = hasPremium || hasBoosterRole;
    if (!isBooster) continue;
    const boostCount = doubleBoosterRoleId && rids.includes(doubleBoosterRoleId) ? 2 : 1;
    boostByUserId.set(uid, {
      name: memberBoostDisplayName(m),
      avatarUrl: memberStaffAvatarUrl(m, gid) || "",
      profileUrl: memberStaffProfileHref(m),
      boostCount,
    });
  }
  const boostHoverMembers = [...boostByUserId.values()]
    .filter((m) => m.name)
    .sort((a, b) => {
      const dc = Number(b.boostCount || 0) - Number(a.boostCount || 0);
      if (dc) return dc;
      return String(a.name).localeCompare(String(b.name), "it", { sensitivity: "base" });
    });
  console.log(
    "[build-site] boosters",
    boostHoverMembers.length,
    "premium_since",
    premiumSinceN,
    "role_only",
    roleOnlyN,
    "roles",
    [...boosterRoleIds]
      .map((id) => String((roleMetas.get(id) && roleMetas.get(id).name) || id))
      .join(", "),
  );
  const staffCount = countedStaffUserIds.size;
  console.log(
    "[build-site] staff badges",
    `paused=${staffStatusFlags.paused.size}`,
    `new=${staffStatusFlags.newRolesByUser.size}`,
  );
  const maintenanceBypassUserIds = maintenanceBypassUserIdsFromMembers(
    members,
    botIds.websiteMaintenanceBypassRoleIds,
  );
  return { html, staffCount, staffHoverGroups, boostHoverMembers, maintenanceBypassUserIds };
}

function mergeLivePulseIntoPayload(payload, pulse, presenceCount) {
  if (!payload || !pulse || typeof pulse !== "object") return payload;
  const mp = pulse.memberPulse && typeof pulse.memberPulse === "object" ? { ...pulse.memberPulse } : null;
  if (mp) {
    if (presenceCount != null && Number.isFinite(Number(presenceCount))) {
      mp.onlineNow = Math.max(0, Math.floor(Number(presenceCount)));
    }
    payload.memberPulse = mp;
  }
  if (pulse.communityHours && typeof pulse.communityHours === "object") {
    payload.communityHours = pulse.communityHours;
  }
  return payload;
}

/** Solo `live-stats-extra.json` (nessun rebuild HTML). Utile con cron sul VPS. */
async function mainLiveStatsExtraOnly() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error("Manca site.config.json in", ROOT);
    process.exit(1);
  }
  const { loadEnvFiles } = require(path.join(__dirname, "..", "..", "shared", "runtime", "fsRuntime.js"));
  loadEnvFiles(ROOT);
  const cfg = readJson(CONFIG_PATH);
  const staffB = cfg.discordStaffListBuild || {};
  const guildIdConfigured = String(staffB.guildId || "").trim();
  const inviteCode = inviteCodeFromConfig(cfg);
  let snap = null;
  if (!guildIdConfigured) {
    if (!inviteCode) {
      console.error(
        "[live-stats-extra] Impossibile ricavare guildId: imposta discordStaffListBuild.guildId o discordInviteUrl in site.config.json.",
      );
      process.exit(1);
    }
    snap = await fetchInviteGuildSnapshot(inviteCode);
  }
  const guildIdResolved = guildIdConfigured || snap?.guildId || "";
  if (!guildIdResolved) {
    console.error("[live-stats-extra] Invite API senza guild id.");
    process.exit(1);
  }
  const staffResult = await buildStaffListBlock(cfg, guildIdResolved);
  const n = staffResult.staffCount != null ? staffResult.staffCount : 0;
  if (staffResult.staffCount == null) {
    console.warn(
      "[live-stats-extra] Conteggio staff non disponibile (token, intent o config). Scrivo staffNoPm: 0.",
    );
  }
  const botTok = String(process.env.DISCORD_WEBSITE_BUILD_BOT_TOKEN || "").trim();
  const [guildLiveCounts, communityPulse] = await Promise.all([
    !envFlagTrue("VC_BUILD_FAST") && guildIdResolved && botTok
      ? fetchGuildLiveStatsCountsFromBot(guildIdResolved, botTok)
      : Promise.resolve(null),
    fetchCommunityPulse(guildIdResolved),
  ]);
  const payload = { staffNoPm: n };
  if (Array.isArray(staffResult.staffHoverGroups) && staffResult.staffHoverGroups.length) {
    payload.staffHoverGroups = staffResult.staffHoverGroups;
  }
  if (Array.isArray(staffResult.boostHoverMembers) && staffResult.boostHoverMembers.length) {
    payload.boostHoverMembers = staffResult.boostHoverMembers;
  }
  if (guildLiveCounts?.memberCount != null) payload.guildMemberCount = guildLiveCounts.memberCount;
  if (guildLiveCounts?.boostCount != null) payload.guildBoostCount = guildLiveCounts.boostCount;
  mergeLivePulseIntoPayload(payload, communityPulse, guildLiveCounts?.presenceCount);
  const outRaw = process.env.VC_LIVE_STATS_JSON_OUT?.trim();
  const out = outRaw || path.join(DIST, "live-stats-extra.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(payload), "utf8");
  const memLog = guildLiveCounts?.memberCount != null ? ` guildMemberCount=${guildLiveCounts.memberCount}` : "";
  const boostN = Array.isArray(payload.boostHoverMembers) ? payload.boostHoverMembers.length : 0;
  const boostSlots = Array.isArray(payload.boostHoverMembers)
    ? payload.boostHoverMembers.reduce((s, row) => s + Math.max(1, Math.floor(Number(row?.boostCount || 1))), 0)
    : 0;
  const pulseLog = payload.memberPulse
    ? ` msgs7d=${payload.memberPulse.messages7d} voice7d=${payload.memberPulse.voiceSeconds7d} active7d=${payload.memberPulse.activeMembers7d} online=${payload.memberPulse.onlineNow ?? "—"}`
    : "";
  console.log(
    "[live-stats-extra] OK",
    out,
    "staffNoPm:",
    n + memLog,
    `boosters=${boostN}`,
    `boostSlots=${boostSlots}`,
    payload.guildBoostCount != null ? `guildBoostCount=${payload.guildBoostCount}` : "",
    pulseLog,
  );
}

/** Entry CLI Tailwind (evita `.cmd` in PATH con `&` nel percorso su Windows). */
function tailwindCliJsPath(webRoot) {
  const cli = path.join(webRoot, "node_modules", "tailwindcss", "lib", "cli.js");
  return fs.existsSync(cli) ? cli : null;
}

/** Genera `css/tw-build.css` (Tailwind v3 CLI). Richiede `npm install` in WebSite/. */
function runTailwindProductionBuild(webRoot) {
  const cli = tailwindCliJsPath(webRoot);
  if (!cli) return false;
  try {
    execFileSync(process.execPath, [cli, "-i", "css/tw-input.css", "-o", "css/tw-build.css", "--minify"], {
      cwd: webRoot,
      env: { ...process.env, BROWSERSLIST_IGNORE_OLD_DATA: "1" },
      stdio: "inherit",
    });
    return true;
  } catch (e) {
    console.error("[build-site] Build Tailwind fallita:", e?.message || e);
    process.exit(1);
  }
}

async function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error("Manca site.config.json in", ROOT);
    process.exit(1);
  }
  const { loadEnvFiles } = require(path.join(__dirname, "..", "..", "shared", "runtime", "fsRuntime.js"));
  loadEnvFiles(ROOT);
  if (!runTailwindProductionBuild(ROOT)) {
    console.error("[build-site] Manca tailwindcss. Esegui: cd WebSite && npm install");
    process.exit(1);
  }
  const cfg = readJson(CONFIG_PATH);
  const buildFast = envFlagTrue("VC_BUILD_FAST");
  if (buildFast) {
    console.log(
      "[build-site] VC_BUILD_FAST: niente scan membri / guild stats bot via API (invite pubblico resta per banner·icona; avatar bot restano via /users/@me). Imposta VC_BUILD_QUIET=1 per meno log.",
    );
  }
  rmrf(DIST);
  copyRecursive(ROOT, DIST);
  applyForbiddenBooksScheduleToDist(DIST);

  const indexPath = path.join(DIST, "index.html");
  let html = fs.readFileSync(indexPath, "utf8");

  const cookieYesBlock = "";

  const gaId = String(cfg.googleAnalyticsMeasurementId || "").trim();
  const gaBlock = gaId
    ? `    <script async src="https://www.googletagmanager.com/gtag/js?id=${escAttr(gaId)}"></script>\n    <script>\n      window.dataLayer = window.dataLayer || [];\n      function gtag(){dataLayer.push(arguments);}\n      gtag("js", new Date());\n      gtag("config", "${escAttr(gaId)}");\n    </script>\n`
    : "";

  const year = String(new Date().getFullYear());

  const wantBanner = cfg.useDiscordGuildBanner !== false;
  const wantIcon = cfg.useDiscordGuildIcon !== false;
  const wantFounded = cfg.useDiscordGuildFoundedDate !== false;
  const wantGuildDescription = cfg.useDiscordGuildDescription !== false;
  const staffB = cfg.discordStaffListBuild || {};
  const staffEnabled = staffB.enabled === true;
  const guildIdConfigured = String(staffB.guildId || "").trim();
  const inviteCode = inviteCodeFromConfig(cfg);

  const needInvite =
    Boolean(inviteCode) &&
    (wantBanner ||
      wantIcon ||
      wantFounded ||
      wantGuildDescription ||
      (staffEnabled && !guildIdConfigured) ||
      cfg.liveStats?.enabled !== false);

  let invitePayload = null;
  if (needInvite) {
    invitePayload = await fetchInviteInvitePayload(inviteCode);
  }
  const snap = invitePayload?.snap ?? null;

  let guildBannerUrl = "";
  let guildIconUrl = FALLBACK_GUILD_ICON;
  let foundedDisplay = String(cfg.foundedDisplay || "").trim() || "—";

  if (snap) {
    if (wantBanner) {
      const bannerUrl = guildBannerCdnUrl(snap.guildId, snap.banner);
      if (bannerUrl) {
        guildBannerUrl = bannerUrl;
      } else {
        console.warn(
          "[build-site] Nessun banner guild (Impostazioni server → Profilo server → Banner).",
        );
      }
    }
    if (wantIcon) {
      const iconUrl = guildIconCdnUrl(snap.guildId, snap.icon, 256);
      if (iconUrl) guildIconUrl = iconUrl;
      else console.warn("[build-site] Nessuna icon guild nell’invite; uso fallback locale.");
    }
    if (wantFounded) {
      const created = snowflakeGuildCreatedUtcDate(snap.guildId);
      const label = formatItalianDateRome(created);
      if (label) foundedDisplay = label;
    }
  }

  const siteName = cfg.siteName || "Vinili & Caffè";
  const siteUrlTrim =
    String(process.env.VC_SITE_URL ?? "").trim() || String(cfg.siteUrl || "").trim();
  if (String(process.env.VC_SITE_URL ?? "").trim()) {
    buildInfoLog("[build-site] VC_SITE_URL (override solo per questo build):", siteUrlTrim);
  }
  const prodSiteBuild = (() => {
    try {
      const h = new URL(siteUrlTrim).hostname.toLowerCase();
      return h !== "localhost" && h !== "127.0.0.1" && h !== "[::1]";
    } catch {
      return true;
    }
  })();
  const distApiLocal = (value) => (prodSiteBuild ? "" : value);

  const defaultInstagramUrl = "https://www.instagram.com/viniliecaffe/";
  const defaultTiktokUrl = "https://www.tiktok.com/@viniliecaffe";
  const instagramUrlResolved = String(cfg.instagramUrl ?? "").trim() || defaultInstagramUrl;
  const tiktokUrlResolved = String(cfg.tiktokUrl ?? "").trim() || defaultTiktokUrl;
  const tiktokGlyphSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43V7.36a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.21z"/></svg>';
  const footerSocialLeft = `          <a class="vc-footer-social-ico" href="${escAttr(instagramUrlResolved)}" target="_blank" rel="noopener noreferrer" aria-label="Instagram - ${escAttr(siteName)}"><i class="fa fa-instagram" aria-hidden="true"></i></a>\n`;
  const footerSocialRight = `          <a class="vc-footer-social-ico vc-footer-social-ico--tiktok" href="${escAttr(tiktokUrlResolved)}" target="_blank" rel="noopener noreferrer" aria-label="TikTok - ${escAttr(siteName)}">${tiktokGlyphSvg}</a>\n`;

  const configuredAbout = String(cfg.aboutDescription ?? "").trim();
  let aboutPlain = "";
  if (wantGuildDescription && snap?.guildDescription) {
    const gd = String(snap.guildDescription).trim();
    if (gd) aboutPlain = gd;
  }
  if (!aboutPlain) {
    aboutPlain = configuredAbout;
  }
  if (!aboutPlain) {
    aboutPlain = `${siteName} è la community ufficiale collegata al bot e alle attività del server: canali tematici, strumenti per lo staff e spazio per condividere ascolti, consigli e novità. Entra su Discord per regolamento, ruoli e annunci aggiornati.`;
  }

  const guildIdResolved = guildIdConfigured || snap?.guildId || "";
  const lsForProxy = cfg.liveStats || {};
  const staffResult = await buildStaffListBlock(cfg, guildIdResolved);
  const buildBotTok = String(process.env.DISCORD_WEBSITE_BUILD_BOT_TOKEN || "").trim();
  const [guildLiveCounts, communityPulse] = await Promise.all([
    !buildFast && guildIdResolved && buildBotTok
      ? fetchGuildLiveStatsCountsFromBot(guildIdResolved, buildBotTok)
      : Promise.resolve(null),
    fetchCommunityPulse(guildIdResolved),
  ]);

  const statMembers =
    guildLiveCounts?.memberCount != null
      ? String(guildLiveCounts.memberCount)
      : snap?.approximateMemberCount != null
        ? String(snap.approximateMemberCount)
        : String(cfg.statMembers ?? "0");
  const statBoosts =
    guildLiveCounts?.boostCount != null
      ? String(guildLiveCounts.boostCount)
      : snap?.boostCount != null
        ? String(snap.boostCount)
        : String(cfg.statBoosts ?? "0");
  const statStaff =
    staffResult.staffCount != null
      ? String(staffResult.staffCount)
      : String(cfg.statStaff ?? "0");

  const liveStatsBootOpts = {
    staffHoverGroups: staffResult.staffHoverGroups,
    boostHoverMembers: staffResult.boostHoverMembers,
    staffNoPm: staffResult.staffCount,
  };
  mergeLivePulseIntoPayload(liveStatsBootOpts, communityPulse, guildLiveCounts?.presenceCount);
  const liveStatsBoot =
    buildLiveStatsBootHtml(cfg, inviteCode, liveStatsBootOpts) +
    buildSiteSponsorAdBootHtml(cfg, { scriptPrefix: "" });
  const liveStatsBootWiki =
    buildLiveStatsBootHtml(cfg, inviteCode, { scriptPrefix: "../", ...liveStatsBootOpts }) +
    buildSiteSponsorAdBootHtml(cfg, { scriptPrefix: "../" });
  const liveStatsBootUser =
    buildLiveStatsBootHtml(cfg, inviteCode, { scriptPrefix: "../", ...liveStatsBootOpts }) +
    buildSiteSponsorAdBootHtml(cfg, { scriptPrefix: "../" });
  const maintenanceBoot = buildMaintenanceBootHtml(cfg, {
    guildStaffBypassIds: staffResult.maintenanceBypassUserIds || [],
  });

  if (lsForProxy.enabled !== false) {
    const extraPath = path.join(DIST, "live-stats-extra.json");
    const extraObj = {
      staffNoPm: staffResult.staffCount != null ? staffResult.staffCount : 0,
    };
    if (Array.isArray(staffResult.staffHoverGroups) && staffResult.staffHoverGroups.length) {
      extraObj.staffHoverGroups = staffResult.staffHoverGroups;
    }
    if (Array.isArray(staffResult.boostHoverMembers) && staffResult.boostHoverMembers.length) {
      extraObj.boostHoverMembers = staffResult.boostHoverMembers;
    }
    if (guildLiveCounts?.memberCount != null) extraObj.guildMemberCount = guildLiveCounts.memberCount;
    if (guildLiveCounts?.boostCount != null) extraObj.guildBoostCount = guildLiveCounts.boostCount;
    mergeLivePulseIntoPayload(extraObj, communityPulse, guildLiveCounts?.presenceCount);
    fs.writeFileSync(extraPath, JSON.stringify(extraObj), "utf8");
  }

  const inviteProxyForSnapshot =
    lsForProxy.inviteProxyPath === ""
      ? ""
      : String(lsForProxy.inviteProxyPath != null ? lsForProxy.inviteProxyPath : "/discord-invite.json");
  if (
    lsForProxy.enabled !== false &&
    String(inviteCode || "").trim() &&
    inviteProxyForSnapshot &&
    invitePayload?.raw
  ) {
    fs.writeFileSync(path.join(DIST, "discord-invite.json"), JSON.stringify(invitePayload.raw), "utf8");
    buildInfoLog(
      "[build-site] Scritto discord-invite.json (snapshot all’avvio del build; in produzione nginx può sostituirlo con il proxy live).",
    );
  }

  const siteOgFallback = "/og.gif?v=oggif1";
  const ogImageOverride = String(cfg.openGraphImageUrl ?? "").trim() || siteOgFallback;
  const ogIconLarge =
    snap?.guildId && snap?.icon && wantIcon ? guildIconCdnUrl(snap.guildId, snap.icon, 1024) : guildIconUrl;
  // Mai usare banner/icon GIF Discord come og:image (Discord non li mostra bene → embed senza banner).
  const ogCandidates = [ogImageOverride, siteOgFallback, guildBannerUrl, ogIconLarge, guildIconUrl];
  let ogImageUrl = "";
  for (const cand of ogCandidates) {
    const abs = forceStaticOgImageUrl(absUrlForMetadata(siteUrlTrim, cand));
    if (abs) {
      ogImageUrl = abs;
      break;
    }
  }
  if (!ogImageUrl) {
    ogImageUrl = absUrlForMetadata(siteUrlTrim, siteOgFallback);
  }
  let ogImageWidth = "128";
  let ogImageHeight = "128";
  const w = Number(cfg.openGraphImageWidth);
  const h = Number(cfg.openGraphImageHeight);
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    ogImageWidth = String(Math.floor(w));
    ogImageHeight = String(Math.floor(h));
  }
  const ogTitle = `${siteName} | Community Discord italiana · ${statMembers}+ membri`;
  const ogDesc = String(cfg.metaDescription || "").trim();
  const ogUrl = siteUrlTrim;
  const ogSiteName = String(cfg.openGraphSiteName || cfg.siteName || siteName).trim() || siteName;
  const ogImageAlt = `${siteName} — community Discord`;
  const themeColorHex = String(cfg.themeColor || "#6f4e37").trim();

  const discordInviteResolved = cfg.discordInviteUrl || "https://discord.gg/viniliecaffe";
  const discordSponsorTicketsMessageResolved =
    String(cfg.discordSponsorTicketsMessageUrl ?? "").trim() ||
    "https://discord.com/channels/1329080093599076474/1442569095068254219/1469836204873744404";
  const siteBaseNoSlash = siteUrlTrim.replace(/\/+$/, "");
  const defaultLegalPath = (slug) =>
    siteBaseNoSlash ? `${siteBaseNoSlash}/${slug}` : `/${slug}`;
  const termsUrlResolved = String(cfg.termsUrl ?? "").trim() || defaultLegalPath("terms");
  const privacyUrlResolved = String(cfg.privacyUrl ?? "").trim() || defaultLegalPath("privacy");
  const cookiePolicyUrlResolved =
    String(cfg.cookiePolicyUrl ?? "").trim() || defaultLegalPath("cookie");
  const copyrightUrlResolved =
    String(cfg.copyrightUrl ?? "").trim() || defaultLegalPath("copyright");
  const legalTermsDate =
    String(cfg.legalTermsUpdated ?? "").trim() || "14 agosto 2026";
  const legalPrivacyDate =
    String(cfg.legalPrivacyUpdated ?? "").trim() || "14 agosto 2026";
  const legalCookieDate =
    String(cfg.legalCookieUpdated ?? "").trim() || "14 agosto 2026";
  const discordInviteDisplay = inviteCode ? `discord.gg/${inviteCode}` : "Discord";
  const wikiUrlResolved =
    String(cfg.wikiUrl ?? "").trim() || (siteBaseNoSlash ? `${siteBaseNoSlash}/wiki` : "/wiki");
  // Non usare siteUrlTrim come fallback: href alla home fa scattare vc-landing.js e segna tutto il menu "corrente".
  const faqUrlResolved = String(cfg.faqUrl ?? "").trim() || defaultLegalPath("faq");
  const sponsorUrlResolved = String(cfg.sponsorUrl ?? "").trim() || defaultLegalPath("sponsor");
  const communityRulesUrlResolved =
    String(cfg.communityRulesUrl ?? "").trim() || defaultLegalPath("regole");
  const modEmail = String(cfg.siteModeratorEmail || cfg.supportEmail || "").trim();
  const supEmail = String(cfg.supportEmail || "").trim();
  const richiesteUnbanUrl = defaultLegalPath("appelli");
  const richiesteUnmuteUrl = (() => {
    const base = String(richiesteUnbanUrl || "/appelli").replace(/\/+$/, "");
    return `${base}?tipo=unmute`;
  })();
  const richiesteCandidatureUrl = defaultLegalPath("candidature");
  const richiesteSuggerimentiUrl = defaultLegalPath("suggerimenti");
  const donationsPageUrl = defaultLegalPath("donazioni");
  const perksPageUrl = defaultLegalPath("perks");
  const votePageUrl = defaultLegalPath("vote");
  const discadiaVoteUrlResolved =
    String(cfg.discadiaVoteUrl ?? "").trim() ||
    "https://discadia.com/vote/viniliecaffe/";
  const topggVoteUrlResolved =
    String(cfg.topggVoteUrl ?? "").trim() ||
    "https://top.gg/discord/servers/832911595289169920";
  const paypalDonationsUrlResolved =
    String(cfg.donationsUrl ?? "").trim() || discordInviteResolved || "#";

  const wikiViniliCfgUrl = String(cfg.wikiBotViniliAvatarUrl ?? "").trim();
  const wikiCaffeCfgUrl = String(cfg.wikiBotCaffeAvatarUrl ?? "").trim();
  const tokenVinili =
    process.env.DISCORD_WEBSITE_BUILD_BOT_TOKEN?.trim() ||
    process.env.DISCORD_TOKEN?.trim();
  const tokenCaffe = process.env.DISCORD_TOKEN_TEST?.trim();
  let wikiViniliFromApi = null;
  let wikiCaffeFromApi = null;
  // Avatar: una sola GET /users/@me — anche in VC_BUILD_FAST (altrimenti resta il placeholder Discord).
  if (!wikiViniliCfgUrl && tokenVinili) {
    wikiViniliFromApi = await fetchBotSelfAvatarUrl(tokenVinili, "Vinili");
    if (wikiViniliFromApi) {
      buildInfoLog("[build-site] Wiki Vinili: avatar da Discord GET /users/@me (account bot).");
    } else {
      console.warn(
        "[build-site] Wiki Vinili: impossibile ottenere l’avatar via API. Imposta DISCORD_TOKEN o DISCORD_WEBSITE_BUILD_BOT_TOKEN nel .env del build, oppure wikiBotViniliAvatarUrl in site.config.json.",
      );
    }
  }
  if (!wikiCaffeCfgUrl && tokenCaffe) {
    wikiCaffeFromApi = await fetchBotSelfAvatarUrl(tokenCaffe, "Caffè");
    if (wikiCaffeFromApi) {
      buildInfoLog("[build-site] Wiki Caffè: avatar da Discord GET /users/@me (account bot).");
    } else {
      console.warn(
        "[build-site] Wiki Caffè: impossibile ottenere l’avatar via API. Imposta DISCORD_TOKEN_TEST (token del bot Coffee) nel .env del build, oppure wikiBotCaffeAvatarUrl in site.config.json.",
      );
    }
  }

  const wikiViniliAvatarRaw =
    wikiViniliCfgUrl ||
    wikiViniliFromApi ||
    "https://cdn.discordapp.com/embed/avatars/1.png";
  const wikiCaffeAvatarRaw =
    wikiCaffeCfgUrl ||
    wikiCaffeFromApi ||
    "https://cdn.discordapp.com/embed/avatars/4.png";
  const siteUrlForAbs = siteUrlTrim;
  const wikiViniliAvatarUrl = absUrlForMetadata(siteUrlForAbs, wikiViniliAvatarRaw);
  const wikiCaffeAvatarUrl = absUrlForMetadata(siteUrlForAbs, wikiCaffeAvatarRaw);

  const wikiEconomyUnlockMs = loadGaleoniEconomyUnlockMs(path.join(ROOT, "..", "Vinyls"));
  const WIKI_CMD_PANES_HTML = buildWikiCommandPanesInnerHtml({
    avatarProdUrl: wikiViniliAvatarUrl,
    avatarTestUrl: wikiCaffeAvatarUrl,
  });

  let discordOauthRedirectRaw = String(cfg.discordOauth?.redirectUri || "").trim();
  if (discordOauthRedirectRaw.includes("discord.com/oauth2/authorize")) {
    console.warn(
      "[build-site] discordOauth.redirectUri sembra l’URL di invito del bot, non la callback del sito. Uso siteUrl.",
    );
    discordOauthRedirectRaw = "";
  }
  const discordOauthRedirectResolved = discordOauthRedirectRaw || siteUrlTrim;
  const discordOauthRedirectNoSlash = discordOauthRedirectResolved.replace(/\/+$/, "");
  const resolvePublicWebhookApiUrl = (raw, fallbackPath = "") => {
    const value = String(raw ?? "").trim();
    if (!value) return fallbackPath;
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("/")) return value;
    return siteBaseNoSlash
      ? `${siteBaseNoSlash.replace(/\/+$/, "")}/${value.replace(/^\/+/, "")}`
      : value;
  };
  const candidatureSubmitApiFromEnv = String(process.env.VC_CANDIDATURE_SUBMIT_API_URL ?? "").trim();
  const candidatureSubmitApiRaw =
    candidatureSubmitApiFromEnv || String(cfg.candidatureSubmitApiUrl ?? "").trim();
  if (candidatureSubmitApiFromEnv) {
    buildInfoLog("[build-site] VC_CANDIDATURE_SUBMIT_API_URL (override):", candidatureSubmitApiFromEnv);
  }
  const candidatureSubmitApiResolved = resolvePublicWebhookApiUrl(candidatureSubmitApiRaw);
  const candidatureSubmitApiLocalFromEnv = String(
    process.env.VC_CANDIDATURE_SUBMIT_API_URL_LOCAL ?? "",
  ).trim();
  const candidatureSubmitApiLocalRaw =
    candidatureSubmitApiLocalFromEnv || String(cfg.candidatureSubmitApiUrlLocal ?? "").trim();
  if (candidatureSubmitApiLocalFromEnv) {
    buildInfoLog(
      "[build-site] VC_CANDIDATURE_SUBMIT_API_URL_LOCAL (override):",
      candidatureSubmitApiLocalFromEnv,
    );
  }
  const candidatureSubmitApiLocalResolved =
    candidatureSubmitApiLocalRaw && /^https?:\/\//i.test(candidatureSubmitApiLocalRaw)
      ? candidatureSubmitApiLocalRaw
      : "";
  const unbanSubmitApiFromEnv = String(process.env.VC_UNBAN_SUBMIT_API_URL ?? "").trim();
  const unbanSubmitApiRaw =
    unbanSubmitApiFromEnv || String(cfg.unbanSubmitApiUrl ?? "").trim();
  const unbanSubmitApiResolved = resolvePublicWebhookApiUrl(unbanSubmitApiRaw);
  const unbanSubmitApiLocalFromEnv = String(process.env.VC_UNBAN_SUBMIT_API_URL_LOCAL ?? "").trim();
  const unbanSubmitApiLocalRaw =
    unbanSubmitApiLocalFromEnv || String(cfg.unbanSubmitApiUrlLocal ?? "").trim();
  const unbanSubmitApiLocalResolved =
    unbanSubmitApiLocalRaw && /^https?:\/\//i.test(unbanSubmitApiLocalRaw)
      ? unbanSubmitApiLocalRaw
      : "";
  const unmuteSubmitApiFromEnv = String(process.env.VC_UNMUTE_SUBMIT_API_URL ?? "").trim();
  const unmuteSubmitApiRaw =
    unmuteSubmitApiFromEnv || String(cfg.unmuteSubmitApiUrl ?? "").trim();
  const unmuteSubmitApiResolved = resolvePublicWebhookApiUrl(
    unmuteSubmitApiRaw || "/webhooks/site-unmute",
  );
  const unmuteSubmitApiLocalFromEnv = String(process.env.VC_UNMUTE_SUBMIT_API_URL_LOCAL ?? "").trim();
  const unmuteSubmitApiLocalRaw =
    unmuteSubmitApiLocalFromEnv || String(cfg.unmuteSubmitApiUrlLocal ?? "").trim();
  const unmuteSubmitApiLocalResolved =
    unmuteSubmitApiLocalRaw && /^https?:\/\//i.test(unmuteSubmitApiLocalRaw)
      ? unmuteSubmitApiLocalRaw
      : "";
  const communityRulesApiFromEnv = String(process.env.VC_COMMUNITY_RULES_API_URL ?? "").trim();
  const communityRulesApiRaw =
    communityRulesApiFromEnv || String(cfg.communityRulesApiUrl ?? "").trim();
  const communityRulesApiResolved = resolvePublicWebhookApiUrl(communityRulesApiRaw, "/webhooks/site-rules");
  const communityRulesApiLocalFromEnv = String(process.env.VC_COMMUNITY_RULES_API_URL_LOCAL ?? "").trim();
  const communityRulesApiLocalRaw =
    communityRulesApiLocalFromEnv || String(cfg.communityRulesApiUrlLocal ?? "").trim();
  const communityRulesApiLocalResolved =
    communityRulesApiLocalRaw && /^https?:\/\//i.test(communityRulesApiLocalRaw)
      ? communityRulesApiLocalRaw
      : "";
  const usersLeaderboardApiFromEnv = String(process.env.VC_USERS_LEADERBOARD_API_URL ?? "").trim();
  const usersLeaderboardApiRaw =
    usersLeaderboardApiFromEnv || String(cfg.usersLeaderboardApiUrl ?? "").trim();
  const usersLeaderboardApiResolved = resolvePublicWebhookApiUrl(usersLeaderboardApiRaw, "/webhooks/site-users");
  const usersLeaderboardApiLocalFromEnv = String(process.env.VC_USERS_LEADERBOARD_API_URL_LOCAL ?? "").trim();
  const usersLeaderboardApiLocalRaw =
    usersLeaderboardApiLocalFromEnv || String(cfg.usersLeaderboardApiUrlLocal ?? "").trim();
  const usersLeaderboardApiLocalResolved =
    usersLeaderboardApiLocalRaw && /^https?:\/\//i.test(usersLeaderboardApiLocalRaw)
      ? usersLeaderboardApiLocalRaw
      : "";
  const voteApiFromEnv = String(process.env.VC_VOTE_API_URL ?? "").trim();
  const voteApiRaw = voteApiFromEnv || String(cfg.voteApiUrl ?? "").trim();
  const voteApiResolved = resolvePublicWebhookApiUrl(voteApiRaw, "/webhooks/site-vote");
  const voteApiLocalFromEnv = String(process.env.VC_VOTE_API_URL_LOCAL ?? "").trim();
  const voteApiLocalRaw = voteApiLocalFromEnv || String(cfg.voteApiUrlLocal ?? "").trim();
  const voteApiLocalResolved =
    voteApiLocalRaw && /^https?:\/\//i.test(voteApiLocalRaw)
      ? voteApiLocalRaw
      : "";
  const siteNotifsApiFromEnv = String(process.env.VC_SITE_NOTIFICATIONS_API_URL ?? "").trim();
  const siteNotifsApiRaw = siteNotifsApiFromEnv || String(cfg.siteNotificationsApiUrl ?? "").trim();
  const siteNotifsApiResolved = resolvePublicWebhookApiUrl(siteNotifsApiRaw, "/webhooks/site-notifications");
  const siteNotifsApiLocalFromEnv = String(process.env.VC_SITE_NOTIFICATIONS_API_URL_LOCAL ?? "").trim();
  const siteNotifsApiLocalRaw = siteNotifsApiLocalFromEnv || String(cfg.siteNotificationsApiUrlLocal ?? "").trim();
  const siteNotifsApiLocalResolved =
    siteNotifsApiLocalRaw && /^https?:\/\//i.test(siteNotifsApiLocalRaw)
      ? siteNotifsApiLocalRaw
      : "";
  const seratafilmAccessApiFromEnv = String(process.env.VC_SERATAFILM_ACCESS_API_URL ?? "").trim();
  const seratafilmAccessApiRaw =
    seratafilmAccessApiFromEnv || String(cfg.seratafilmAccessApiUrl ?? "").trim();
  const seratafilmAccessApiResolved = resolvePublicWebhookApiUrl(
    seratafilmAccessApiRaw,
    "/webhooks/site-seratafilm-access",
  );
  const seratafilmAccessApiLocalFromEnv = String(process.env.VC_SERATAFILM_ACCESS_API_URL_LOCAL ?? "").trim();
  const seratafilmAccessApiLocalRaw =
    seratafilmAccessApiLocalFromEnv || String(cfg.seratafilmAccessApiUrlLocal ?? "").trim();
  const seratafilmAccessApiLocalResolved =
    seratafilmAccessApiLocalRaw && /^https?:\/\//i.test(seratafilmAccessApiLocalRaw)
      ? seratafilmAccessApiLocalRaw
      : "";
  const staffAccessApiFromEnv = String(process.env.VC_STAFF_ACCESS_API_URL ?? "").trim();
  const staffAccessApiRaw =
    staffAccessApiFromEnv || String(cfg.staffAccessApiUrl ?? "").trim();
  const staffAccessApiResolved = resolvePublicWebhookApiUrl(
    staffAccessApiRaw,
    "/webhooks/site-staff-access",
  );
  const staffAccessApiLocalFromEnv = String(process.env.VC_STAFF_ACCESS_API_URL_LOCAL ?? "").trim();
  const staffAccessApiLocalRaw =
    staffAccessApiLocalFromEnv || String(cfg.staffAccessApiUrlLocal ?? "").trim();
  const staffAccessApiLocalResolved =
    staffAccessApiLocalRaw && /^https?:\/\//i.test(staffAccessApiLocalRaw)
      ? staffAccessApiLocalRaw
      : "";
  const staffPauseApiFromEnv = String(process.env.VC_STAFF_PAUSE_API_URL ?? "").trim();
  const staffPauseApiRaw =
    staffPauseApiFromEnv || String(cfg.staffPauseApiUrl ?? "").trim();
  const staffPauseApiResolved = resolvePublicWebhookApiUrl(
    staffPauseApiRaw,
    "/webhooks/site-staff-pause",
  );
  const staffPauseApiLocalFromEnv = String(process.env.VC_STAFF_PAUSE_API_URL_LOCAL ?? "").trim();
  const staffPauseApiLocalRaw =
    staffPauseApiLocalFromEnv || String(cfg.staffPauseApiUrlLocal ?? "").trim();
  const staffPauseApiLocalResolved =
    staffPauseApiLocalRaw && /^https?:\/\//i.test(staffPauseApiLocalRaw)
      ? staffPauseApiLocalRaw
      : "";
  const staffProfileApiFromEnv = String(process.env.VC_STAFF_PROFILE_API_URL ?? "").trim();
  const staffProfileApiRaw =
    staffProfileApiFromEnv || String(cfg.staffProfileApiUrl ?? "").trim();
  const staffProfileApiResolved = resolvePublicWebhookApiUrl(
    staffProfileApiRaw,
    "/webhooks/site-staff-profile",
  );
  const staffProfileApiLocalFromEnv = String(process.env.VC_STAFF_PROFILE_API_URL_LOCAL ?? "").trim();
  const staffProfileApiLocalRaw =
    staffProfileApiLocalFromEnv || String(cfg.staffProfileApiUrlLocal ?? "").trim();
  const staffProfileApiLocalResolved =
    staffProfileApiLocalRaw && /^https?:\/\//i.test(staffProfileApiLocalRaw)
      ? staffProfileApiLocalRaw
      : "";
  function resolveStaffToolApi(envKey, cfgKey, envLocalKey, cfgLocalKey, fallbackPath) {
    const fromEnv = String(process.env[envKey] ?? "").trim();
    const raw = fromEnv || String(cfg[cfgKey] ?? "").trim();
    const resolved = resolvePublicWebhookApiUrl(raw, fallbackPath);
    const localFromEnv = String(process.env[envLocalKey] ?? "").trim();
    const localRaw = localFromEnv || String(cfg[cfgLocalKey] ?? "").trim();
    const localResolved =
      localRaw && /^https?:\/\//i.test(localRaw) ? localRaw : "";
    return { resolved, localResolved };
  }
  const staffPmHubApi = resolveStaffToolApi(
    "VC_STAFF_PM_HUB_API_URL",
    "staffPmHubApiUrl",
    "VC_STAFF_PM_HUB_API_URL_LOCAL",
    "staffPmHubApiUrlLocal",
    "/webhooks/site-staff-pm-hub",
  );
  const staffPmShopApi = resolveStaffToolApi(
    "VC_STAFF_PM_SHOP_API_URL",
    "staffPmShopApiUrl",
    "VC_STAFF_PM_SHOP_API_URL_LOCAL",
    "staffPmShopApiUrlLocal",
    "/webhooks/site-staff-pm-shop",
  );
  const staffPmPointsRemovedApi = resolveStaffToolApi(
    "VC_STAFF_PM_POINTS_REMOVED_API_URL",
    "staffPmPointsRemovedApiUrl",
    "VC_STAFF_PM_POINTS_REMOVED_API_URL_LOCAL",
    "staffPmPointsRemovedApiUrlLocal",
    "/webhooks/site-staff-pm-points-removed",
  );
  const staffTicketsApi = resolveStaffToolApi(
    "VC_STAFF_TICKETS_API_URL",
    "staffTicketsApiUrl",
    "VC_STAFF_TICKETS_API_URL_LOCAL",
    "staffTicketsApiUrlLocal",
    "/webhooks/site-staff-tickets",
  );
  const staffSerataFilmApi = resolveStaffToolApi(
    "VC_STAFF_SERATAFILM_API_URL",
    "staffSerataFilmApiUrl",
    "VC_STAFF_SERATAFILM_API_URL_LOCAL",
    "staffSerataFilmApiUrlLocal",
    "/webhooks/site-staff-seratafilm",
  );
  const staffGuideApi = resolveStaffToolApi(
    "VC_STAFF_GUIDE_API_URL",
    "staffGuideApiUrl",
    "VC_STAFF_GUIDE_API_URL_LOCAL",
    "staffGuideApiUrlLocal",
    "/webhooks/site-staff-guide",
  );
  const staffDashboardApi = resolveStaffToolApi(
    "VC_STAFF_DASHBOARD_API_URL",
    "staffDashboardApiUrl",
    "VC_STAFF_DASHBOARD_API_URL_LOCAL",
    "staffDashboardApiUrlLocal",
    "/webhooks/site-staff-dashboard",
  );
  const staffManageApi = resolveStaffToolApi(
    "VC_STAFF_MANAGE_API_URL",
    "staffManageApiUrl",
    "VC_STAFF_MANAGE_API_URL_LOCAL",
    "staffManageApiUrlLocal",
    "/webhooks/site-staff-manage",
  );
  const staffOrganicoApi = resolveStaffToolApi(
    "VC_STAFF_ORGANICO_API_URL",
    "staffOrganicoApiUrl",
    "VC_STAFF_ORGANICO_API_URL_LOCAL",
    "staffOrganicoApiUrlLocal",
    "/webhooks/site-staff-organico",
  );
  const hogwartsSortingApiFromEnv = String(process.env.VC_HOGWARTS_SORTING_API_URL ?? "").trim();
  const hogwartsSortingApiRaw =
    hogwartsSortingApiFromEnv || String(cfg.hogwartsSortingApiUrl ?? "").trim();
  const hogwartsSortingApiResolved = resolvePublicWebhookApiUrl(
    hogwartsSortingApiRaw,
    "/webhooks/site-hogwarts-sorting",
  );
  const hogwartsSortingApiLocalFromEnv = String(process.env.VC_HOGWARTS_SORTING_API_URL_LOCAL ?? "").trim();
  const hogwartsSortingApiLocalRaw =
    hogwartsSortingApiLocalFromEnv || String(cfg.hogwartsSortingApiUrlLocal ?? "").trim();
  const hogwartsSortingApiLocalResolved =
    hogwartsSortingApiLocalRaw && /^https?:\/\//i.test(hogwartsSortingApiLocalRaw)
      ? hogwartsSortingApiLocalRaw
      : "";
  const hogwartsSortingPageUrl = siteBaseNoSlash
    ? `${siteBaseNoSlash}/evento/smistamento`
    : "/evento/smistamento";
  const hogwartsPointsPageUrl = siteBaseNoSlash
    ? `${siteBaseNoSlash}/evento/coppa`
    : "/evento/coppa";
  const hogwartsShopPageUrl = siteBaseNoSlash
    ? `${siteBaseNoSlash}/evento/shop`
    : "/evento/shop";
  const hogwartsPotionsPageUrl = siteBaseNoSlash
    ? `${siteBaseNoSlash}/evento/pozioni`
    : "/evento/pozioni";
  const hogwartsHubPageUrl = siteBaseNoSlash ? `${siteBaseNoSlash}/evento` : "/evento";
  const {
    resolveHogwartsEventCalendar,
    buildEventNavItemsHtml,
    buildEventHeaderHtml,
    buildHeaderPromoBootHtml,
    buildHeaderPromoButtonHtml,
    buildHeaderPromoClientConfig,
    buildHogwartsEventNavBootHtml,
    resolvePublicHeaderPromoMode,
    resolveEventHeaderPromoMode,
    parseDateStartMs,
    parseDateEndMs,
    serializeCalendarForWeb,
  } = require(path.join(ROOT, "..", "Vinyls", "Utils", "Web", "hogwartsEventCalendar.js"));
  const {
    formatEventWindowIt: formatHogwartsEventWindowIt,
    formatSortingWindowIt: formatHogwartsSortingWindowIt,
    isEventWindowOpen: hogwartsIsEventWindowOpen,
    isSortingWindowOpen: hogwartsIsSortingWindowOpen,
  } = require(path.join(
    ROOT,
    "..",
    "Vinyls",
    "Utils",
    "Web",
    "hogwartsSortingConfig.js",
  ));
  const hogwartsCrestsPath = "../../images/evento-hogwarts/crests/";
  const hogwartsIntroVideo = "/images/evento-hogwarts/inizio.mp4";
  const hogwartsEventRaw = cfg.hogwartsEvent && typeof cfg.hogwartsEvent === "object" ? cfg.hogwartsEvent : {};
  const hogwartsPotionsRaw = cfg.hogwartsPotions && typeof cfg.hogwartsPotions === "object" ? cfg.hogwartsPotions : {};
  const hogwartsPotionsStartDate = String(hogwartsPotionsRaw.startDate || "2026-08-24T12:00:00").trim() || "2026-08-24T12:00:00";
  const hogwartsPotionsRedirectUrl = String(hogwartsPotionsRaw.redirectUrl || hogwartsShopPageUrl || "/evento/shop").trim() || "/evento/shop";
  const hogwartsIntroDurationSec = Math.max(
    1,
    Math.min(120, Number(hogwartsEventRaw.introVideoDurationSec) || 12),
  );
  const hogwartsIntroTrimEndSec = Math.max(
    0,
    Math.min(30, Number(hogwartsEventRaw.introVideoTrimEndSec) || 0),
  );
  const {
    HOUSES: hogwartsHouses,
    QUESTIONS: hogwartsScoringQuestions,
    getHouseMeta: getHogwartsHouseMeta,
    getPublicQuestions: getHogwartsPublicQuestions,
  } = require(path.join(ROOT, "..", "Vinyls", "Utils", "Web", "hogwartsSortingBank.js"));
  const hogwartsEventKey = String(hogwartsEventRaw.eventKey || "hogwarts_summer_2026").trim() || "hogwarts_summer_2026";
  const hogwartsEventTimezone = String(hogwartsEventRaw.timezone || "Europe/Rome").trim() || "Europe/Rome";
  const hogwartsSortingStartDate =
    String(hogwartsEventRaw.sortingStartDate || hogwartsEventRaw.startDate || "2026-06-01T12:00:00").trim() ||
    "2026-06-01T12:00:00";
  const hogwartsEventWindowLabel =
    formatHogwartsEventWindowIt({
      timezone: hogwartsEventRaw.timezone || "Europe/Rome",
      startDate: hogwartsEventRaw.startDate || "2026-06-01T14:00:00",
      endDate: hogwartsEventRaw.endDate || "2026-09-01T12:00:00",
    }) || "";
  const hogwartsSortingWindowLabel =
    formatHogwartsSortingWindowIt({
      timezone: hogwartsEventRaw.timezone || "Europe/Rome",
      sortingStartDate: hogwartsSortingStartDate,
      endDate: hogwartsEventRaw.endDate || "2026-09-01T12:00:00",
    }) || hogwartsEventWindowLabel;
  const hogwartsStaticWindowState = hogwartsIsEventWindowOpen(
    {
      enabled: hogwartsEventRaw.enabled !== false,
      startMs: parseDateStartMs(hogwartsEventRaw.startDate || "2026-06-01T14:00:00", hogwartsEventTimezone),
      endMs: parseDateEndMs(hogwartsEventRaw.endDate || "2026-09-01T12:00:00", hogwartsEventTimezone),
      staffBypassUserIds: Array.isArray(hogwartsEventRaw.staffBypassUserIds)
        ? hogwartsEventRaw.staffBypassUserIds.map((v) => String(v || "").trim()).filter(Boolean)
        : [],
    },
    Date.now(),
    null,
  );
  const hogwartsSortingStaticWindowState = hogwartsIsSortingWindowOpen(
    {
      enabled: hogwartsEventRaw.enabled !== false,
      sortingStartMs: parseDateStartMs(hogwartsSortingStartDate, hogwartsEventTimezone),
      endMs: parseDateEndMs(hogwartsEventRaw.endDate || "2026-09-01T12:00:00", hogwartsEventTimezone),
      staffBypassUserIds: Array.isArray(hogwartsEventRaw.staffBypassUserIds)
        ? hogwartsEventRaw.staffBypassUserIds.map((v) => String(v || "").trim()).filter(Boolean)
        : [],
    },
    Date.now(),
    null,
  );
  const hogwartsEventCalendarResolved = resolveHogwartsEventCalendar(hogwartsEventRaw, siteBaseNoSlash);
  hogwartsEventCalendarResolved.windowLabel = hogwartsSortingWindowLabel;
  hogwartsEventCalendarResolved.potions = {
    enabled: hogwartsPotionsRaw.enabled !== false,
    startMs: parseDateStartMs(hogwartsPotionsStartDate, hogwartsEventTimezone),
    startDate: hogwartsPotionsStartDate,
  };
  const hogwartsEventCalendarWeb = serializeCalendarForWeb(hogwartsEventCalendarResolved);
  const hogwartsEventNav = {
    previewMode: hogwartsEventRaw.previewMode === true,
    accessApiUrl: `${String(hogwartsSortingApiResolved || "/webhooks/site-hogwarts-sorting").replace(/\/+$/, "")}/access`,
    accessApiUrlLocal: distApiLocal(
      hogwartsSortingApiLocalResolved
        ? `${String(hogwartsSortingApiLocalResolved).replace(/\/+$/, "")}/access`
        : "",
    ),
    potions: hogwartsEventCalendarResolved.potions,
  };
  const hogwartsEventNavBoot = buildHogwartsEventNavBootHtml(hogwartsEventNav);
  const hogwartsEventCalendarJsonEscaped = JSON.stringify(hogwartsEventCalendarWeb)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
  const notificationsPageUrl = siteBaseNoSlash ? `${siteBaseNoSlash}/notifications/` : "/notifications/";
  const headerPromoClientConfig = buildHeaderPromoClientConfig({
    eventRaw: hogwartsEventRaw,
    eventUrl: hogwartsHubPageUrl,
    candidatureUrl: richiesteCandidatureUrl,
  });
  const headerPromoMode = resolvePublicHeaderPromoMode(hogwartsEventRaw);
  const headerPromoButtonHtml = buildHeaderPromoButtonHtml({
    mode: headerPromoMode,
    eventUrl: hogwartsHubPageUrl,
    candidatureUrl: richiesteCandidatureUrl,
  });
  const eventHeaderPromoButtonHtml = buildHeaderPromoButtonHtml({
    mode: resolveEventHeaderPromoMode(hogwartsEventRaw),
    eventUrl: hogwartsHubPageUrl,
    candidatureUrl: richiesteCandidatureUrl,
  });
  const hogwartsPotionsPlayable =
    hogwartsPotionsRaw.enabled !== false &&
    Number.isFinite(parseDateStartMs(hogwartsPotionsStartDate)) &&
    Date.now() >= parseDateStartMs(hogwartsPotionsStartDate);
  const hogwartsEventHeaderFor = (activeId) =>
    buildEventHeaderHtml({
      siteName,
      siteUrl: siteUrlTrim,
      discordInviteUrl: discordInviteResolved,
      guildIconUrl,
      navItemsHtml: buildEventNavItemsHtml(hogwartsEventCalendarResolved.pages, activeId, {
        previewMode: hogwartsEventRaw.previewMode === true,
        potionsPlayable: hogwartsPotionsPlayable,
      }),
      eventNavBootHtml: hogwartsEventNavBoot,
      userPageUrl,
      notificationsUrl: notificationsPageUrl,
      promoButtonHtml: eventHeaderPromoButtonHtml,
    });
  const hogwartsStaticBootstrap = {
    ok: true,
    event: {
      enabled: hogwartsEventRaw.enabled !== false,
      previewMode: hogwartsEventRaw.previewMode === true,
      timezone: String(hogwartsEventRaw.timezone || "Europe/Rome"),
      startDate: hogwartsSortingStartDate,
      endDate: String(hogwartsEventRaw.endDate || "2026-09-01T12:00:00"),
      eventKey: hogwartsEventKey,
      gringott: {
        bank: "Gringott",
        currency: "Galeone d'Oro",
        currencyPlural: "Galeoni d'Oro",
        sortingReward: Math.max(1, Math.floor(Number(hogwartsEventRaw.gringott?.sortingReward) || 25)),
      },
      windowLabel: hogwartsSortingWindowLabel,
      phase: hogwartsEventRaw.previewMode === true ? "preview_forbidden" : hogwartsSortingStaticWindowState.phase,
      open: hogwartsEventRaw.previewMode === true ? false : Boolean(hogwartsSortingStaticWindowState.open),
      startsAtMs: hogwartsSortingStaticWindowState.startsAtMs ?? parseDateStartMs(hogwartsSortingStartDate, hogwartsEventTimezone),
      endsAtMs: hogwartsSortingStaticWindowState.endsAtMs ?? parseDateEndMs(hogwartsEventRaw.endDate || "2026-09-01T12:00:00", hogwartsEventTimezone),
    },
    questions: getHogwartsPublicQuestions(),
    houses: hogwartsHouses.map((id) => getHogwartsHouseMeta(id, String(hogwartsEventRaw.houses?.[id]?.crestUrl || "").trim() || undefined)).filter(Boolean),
  };
  const hogwartsStaticBootstrapUri = encodeURIComponent(JSON.stringify(hogwartsStaticBootstrap)).replace(/'/g, "%27");
  const hogwartsHousePointsRaw =
    cfg.hogwartsHousePoints && typeof cfg.hogwartsHousePoints === "object"
      ? cfg.hogwartsHousePoints
      : hogwartsEventRaw.housePoints && typeof hogwartsEventRaw.housePoints === "object"
        ? hogwartsEventRaw.housePoints
        : {};
  const buildHogwartsPointsBoardPayload = (rawBoard = {}, fallbackRaw = {}) => {
    const board = rawBoard && typeof rawBoard === "object" ? rawBoard : {};
    const fallback = fallbackRaw && typeof fallbackRaw === "object" ? fallbackRaw : {};
    return {
      title: String(board.title || "").trim(),
      subtitle: String(board.subtitle || "").trim(),
      periods: Array.isArray(board.periods)
        ? board.periods
            .map((period) => {
              if (period && typeof period === "object") {
                return {
                  label: String(period.label || "").trim(),
                  range: String(period.range || period.duration || "").trim(),
                  startDate: String(period.startDate || "").trim(),
                  endDate: String(period.endDate || "").trim(),
                };
              }
              return String(period || "").trim();
            })
            .filter((period) => typeof period === "string" ? Boolean(period) : Boolean(period.label || period.range || period.startDate || period.endDate))
        : [],
      maxPoints: Math.max(1, Math.floor(Number(board.maxPoints ?? fallback.maxPoints) || 10000)),
      scaleStops: Array.isArray(board.scaleStops || fallback.scaleStops)
        ? (board.scaleStops || fallback.scaleStops)
          .map((n) => Math.max(0, Math.floor(Number(n) || 0)))
          .filter(Boolean)
        : undefined,
      houses: Object.fromEntries(
        hogwartsHouses.map((id) => {
          const meta = getHogwartsHouseMeta(id, String(hogwartsEventRaw.houses?.[id]?.crestUrl || "").trim() || undefined);
          return [
            id,
            {
              label: meta?.label || id,
              motto: meta?.motto || "",
              points: Math.max(0, Math.floor(Number(board[id] ?? fallback[id]) || 0)),
              color: meta?.primary || "#7c2d12",
              accent: meta?.accent || "#d4af37",
              crestUrl: meta?.crestUrl || `${hogwartsCrestsPath}${meta?.crestFile || `${id}.png`}`,
            },
          ];
        }),
      ),
    };
  };
  const schoolYearPointsRaw = hogwartsHousePointsRaw.schoolYear && typeof hogwartsHousePointsRaw.schoolYear === "object" ? hogwartsHousePointsRaw.schoolYear : hogwartsHousePointsRaw;
  const eventTotalPointsRaw = hogwartsHousePointsRaw.eventTotal && typeof hogwartsHousePointsRaw.eventTotal === "object" ? hogwartsHousePointsRaw.eventTotal : hogwartsHousePointsRaw;
  const hogwartsPointsPollMs = Number.isFinite(Number(hogwartsHousePointsRaw.pollIntervalMs))
    ? Number(hogwartsHousePointsRaw.pollIntervalMs)
    : Number.isFinite(Number(cfg.liveStats?.pollIntervalMs))
      ? Number(cfg.liveStats.pollIntervalMs)
      : 15000;
  const hogwartsPointsPayload = {
    pollIntervalMs: hogwartsPointsPollMs >= 5000 ? hogwartsPointsPollMs : 15000,
    boards: {
      schoolYear: buildHogwartsPointsBoardPayload(schoolYearPointsRaw, hogwartsHousePointsRaw),
      eventTotal: buildHogwartsPointsBoardPayload(eventTotalPointsRaw, hogwartsHousePointsRaw),
    },
  };
  const hogwartsPointsUri = encodeURIComponent(JSON.stringify(hogwartsPointsPayload)).replace(/'/g, "%27");
  const seratafilmBgmRaw = cfg.seratafilmBgm && typeof cfg.seratafilmBgm === "object" ? cfg.seratafilmBgm : {};
  const seratafilmBgmTrackUrls = Array.isArray(seratafilmBgmRaw.trackUrls)
    ? seratafilmBgmRaw.trackUrls
        .map((u) => String(u || "").trim())
        .filter((u) => /^https?:\/\//i.test(u))
    : [];
  const seratafilmYtRaw =
    seratafilmBgmRaw.youtube && typeof seratafilmBgmRaw.youtube === "object" ? seratafilmBgmRaw.youtube : {};
  function seratafilmParseYoutubeVideoId(input) {
    const s = String(input || "").trim();
    if (!s) return "";
    if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
    const m =
      s.match(/[?&]v=([a-zA-Z0-9_-]{11})(?:[&]|$|#)/) ||
      s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})(?:[?]|$|\/|#)/) ||
      s.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:[?]|$|#)/);
    return m ? m[1] : "";
  }
  function seratafilmParseYoutubePlaylistId(input) {
    const s = String(input || "").trim();
    if (!s) return "";
    if (/^[a-zA-Z0-9_-]{10,80}$/.test(s) && /^[A-Z]{2}/.test(s)) return s;
    const m = s.match(/[?&]list=([^&#]+)/);
    if (!m) return "";
    try {
      const id = decodeURIComponent(m[1]).replace(/[^a-zA-Z0-9_-]/g, "");
      return /^[a-zA-Z0-9_-]{10,80}$/.test(id) && /^[A-Z]{2}/.test(id) ? id : "";
    } catch {
      return "";
    }
  }
  function seratafilmParseYoutubeStartSec(input) {
    const s = String(input || "").trim();
    const m = s.match(/[?&](?:t|start)=(\d+)/);
    return m ? Math.max(0, parseInt(m[1], 10)) : 0;
  }
  function seratafilmCollectYoutubeFromUrls(urls) {
    const list = Array.isArray(urls) ? urls : [];
    const ids = [];
    let startSeconds = 0;
    for (const raw of list) {
      const id = seratafilmParseYoutubeVideoId(raw);
      if (!id) continue;
      ids.push(id);
      if (!startSeconds) startSeconds = seratafilmParseYoutubeStartSec(raw);
    }
    return { videoIds: [...new Set(ids)], startSeconds };
  }
  const hogwartsBgmRaw = cfg.hogwartsBgm && typeof cfg.hogwartsBgm === "object" ? cfg.hogwartsBgm : {};
  const hogwartsYtRaw =
    hogwartsBgmRaw.youtube && typeof hogwartsBgmRaw.youtube === "object" ? hogwartsBgmRaw.youtube : {};
  const hogwartsBgmYtVideoIdsFromUrls = Array.isArray(hogwartsYtRaw.videoUrls)
    ? [
        ...new Set(
          hogwartsYtRaw.videoUrls.map((u) => seratafilmParseYoutubeVideoId(u)).filter(Boolean),
        ),
      ]
    : [];
  const hogwartsBgmYtVideoIdsDirect = Array.isArray(hogwartsYtRaw.videoIds)
    ? [...new Set(hogwartsYtRaw.videoIds.map((x) => seratafilmParseYoutubeVideoId(x)).filter(Boolean))]
    : [];
  const hogwartsBgmYtVideoIds = [
    ...new Set([...hogwartsBgmYtVideoIdsDirect, ...hogwartsBgmYtVideoIdsFromUrls]),
  ];
  let hogwartsBgmYoutubePublic = null;
  const hogwartsPlaylistUrlRaw = Array.isArray(hogwartsYtRaw.playlistUrl)
    ? String(hogwartsYtRaw.playlistUrl[0] || "").trim()
    : String(hogwartsYtRaw.playlistId || hogwartsYtRaw.playlistUrl || "").trim();
  const hogwartsBgmYtPlaylistId = seratafilmParseYoutubePlaylistId(hogwartsPlaylistUrlRaw);
  if (hogwartsBgmYtPlaylistId) {
    hogwartsBgmYoutubePublic = { playlistId: hogwartsBgmYtPlaylistId, videoIds: [] };
  } else if (hogwartsBgmYtVideoIds.length) {
    hogwartsBgmYoutubePublic = { playlistId: "", videoIds: hogwartsBgmYtVideoIds };
  }
  const hogwartsBgmPayload = {
    baseVolume: Math.min(1, Math.max(0.02, Number(hogwartsBgmRaw.baseVolume) || 0.2)),
  };
  if (hogwartsBgmYoutubePublic) hogwartsBgmPayload.youtube = hogwartsBgmYoutubePublic;
  let hogwartsBgmUri = encodeURIComponent(JSON.stringify(hogwartsBgmPayload)).replace(/'/g, "%27");
  let hogwartsBgmJson = JSON.stringify(hogwartsBgmPayload);
  const seratafilmBgmYtPlaylistId = seratafilmParseYoutubePlaylistId(
    String(seratafilmYtRaw.playlistId || seratafilmYtRaw.playlistUrl || "").trim(),
  );
  const seratafilmDefaultYt = seratafilmCollectYoutubeFromUrls(seratafilmYtRaw.videoUrls);
  const seratafilmEventYtUrls =
    Array.isArray(seratafilmYtRaw.eventVideoUrls) && seratafilmYtRaw.eventVideoUrls.length
      ? seratafilmYtRaw.eventVideoUrls
      : hogwartsYtRaw.videoUrls;
  const seratafilmEventYt = seratafilmCollectYoutubeFromUrls(seratafilmEventYtUrls);
  const seratafilmBgmYtVideoIdsDirect = Array.isArray(seratafilmYtRaw.videoIds)
    ? [...new Set(seratafilmYtRaw.videoIds.map((x) => seratafilmParseYoutubeVideoId(x)).filter(Boolean))]
    : [];
  if (seratafilmBgmYtVideoIdsDirect.length && !seratafilmDefaultYt.videoIds.length) {
    seratafilmDefaultYt.videoIds = seratafilmBgmYtVideoIdsDirect;
  }
  let seratafilmBgmYoutubePublic = null;
  if (seratafilmBgmYtPlaylistId) {
    seratafilmBgmYoutubePublic = { playlistId: seratafilmBgmYtPlaylistId, videoIds: [] };
  } else if (seratafilmDefaultYt.videoIds.length || seratafilmEventYt.videoIds.length) {
    seratafilmBgmYoutubePublic = {
      playlistId: "",
      videoIds: seratafilmDefaultYt.videoIds,
      defaultVideoIds: seratafilmDefaultYt.videoIds,
      defaultStartSeconds: seratafilmDefaultYt.startSeconds,
      eventVideoIds: seratafilmEventYt.videoIds,
      eventStartSeconds: seratafilmEventYt.startSeconds,
    };
  }
  const seratafilmBgmPayload = {
    trackUrls: seratafilmBgmTrackUrls,
    fadeStartSeconds: Math.max(5, Math.min(3600, Number(seratafilmBgmRaw.fadeStartSeconds) || 120)),
    baseVolume: Math.min(1, Math.max(0.02, Number(seratafilmBgmRaw.baseVolume) || 0.34)),
    hogwartsEventWindow: {
      enabled: hogwartsEventRaw.enabled !== false,
      startMs: parseDateStartMs(hogwartsEventRaw.startDate || "2026-06-01T14:00:00", hogwartsEventTimezone),
      endMs: parseDateEndMs(hogwartsEventRaw.endDate || "2026-09-01T12:00:00", hogwartsEventTimezone),
    },
  };
  if (seratafilmBgmYoutubePublic) seratafilmBgmPayload.youtube = seratafilmBgmYoutubePublic;
  const seratafilmBgmUri = encodeURIComponent(JSON.stringify(seratafilmBgmPayload)).replace(/'/g, "%27");
  const seratafilmEventRaw = cfg.seratafilmEvent && typeof cfg.seratafilmEvent === "object" ? cfg.seratafilmEvent : {};
  const seratafilmRec = seratafilmEventRaw.recurring || seratafilmEventRaw.weekly || {};
  const seratafilmScheduleRaw = Array.isArray(seratafilmEventRaw.schedule) ? seratafilmEventRaw.schedule : [];
  const seratafilmSchedule = seratafilmScheduleRaw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const date = String(row.date || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      if (row.skip) return { date, skip: true };
      const title = String(row.title || "").trim();
      if (!title) return null;
      return { date, title };
    })
    .filter(Boolean);
  const seratafilmEventPayload = {
    timezone: String(seratafilmEventRaw.timezone || "Europe/Rome").trim() || "Europe/Rome",
    recurring: {
      weekday: Number.isFinite(Number(seratafilmRec.weekday))
        ? Math.max(0, Math.min(6, Math.floor(Number(seratafilmRec.weekday))))
        : 6,
      hour: Number.isFinite(Number(seratafilmRec.hour))
        ? Math.max(0, Math.min(23, Math.floor(Number(seratafilmRec.hour))))
        : 21,
      minute: Number.isFinite(Number(seratafilmRec.minute))
        ? Math.max(0, Math.min(59, Math.floor(Number(seratafilmRec.minute))))
        : 0,
    },
    overrideIso: String(seratafilmEventRaw.overrideIso || seratafilmEventRaw.fixedIso || "").trim(),
    // Path pubblico in config: in produzione nginx lo blocca; lo stream reale arriva da filmStreamUrl.
    linkFilm: String(seratafilmEventRaw.linkFilm || "").trim(),
    hogwartsThemeVideoUrl: String(seratafilmEventRaw.hogwartsThemeVideoUrl || hogwartsIntroVideo).trim(),
    hogwartsEventWindow: {
      enabled: hogwartsEventRaw.enabled !== false,
      startMs: parseDateStartMs(hogwartsEventRaw.startDate || "2026-06-01T14:00:00", hogwartsEventTimezone),
      endMs: parseDateEndMs(hogwartsEventRaw.endDate || "2026-09-01T12:00:00", hogwartsEventTimezone),
    },
    filmTitle: String(seratafilmEventRaw.filmTitle || "").trim(),
    nextFilmTitle: String(seratafilmEventRaw.nextFilmTitle || "").trim(),
    adBreak: (() => {
      const raw = seratafilmEventRaw.adBreak && typeof seratafilmEventRaw.adBreak === "object" ? seratafilmEventRaw.adBreak : {};
      const videoUrl = String(raw.videoUrl || "").trim();
      if (raw.enabled === false || !videoUrl) return { enabled: false };
      return {
        enabled: true,
        videoUrl,
        atPercent: Number.isFinite(Number(raw.atPercent))
          ? Math.max(1, Math.min(99, Math.floor(Number(raw.atPercent))))
          : 50,
        totalMs: Number.isFinite(Number(raw.totalMs))
          ? Math.max(30000, Math.min(180000, Math.floor(Number(raw.totalMs))))
          : 60000,
        introMs: Number.isFinite(Number(raw.introMs))
          ? Math.max(5000, Math.min(45000, Math.floor(Number(raw.introMs))))
          : 15000,
        outroMs: Number.isFinite(Number(raw.outroMs))
          ? Math.max(5000, Math.min(45000, Math.floor(Number(raw.outroMs))))
          : 15000,
        introTitle: String(raw.introTitle || "Pausa pubblicitaria").trim() || "Pausa pubblicitaria",
        introText: String(raw.introText || "Tra poco riprenderemo la proiezione. Resta con noi!").trim(),
        outroTitle: String(raw.outroTitle || "La proiezione riprende").trim() || "La proiezione riprende",
        outroText: String(raw.outroText || "Grazie per la pazienza. Buona visione!").trim(),
      };
    })(),
    schedule: seratafilmSchedule,
  };
  const seratafilmEventUri = encodeURIComponent(JSON.stringify(seratafilmEventPayload)).replace(/'/g, "%27");
  const reviewsApiFromEnv = String(process.env.VC_REVIEWS_API_URL ?? "").trim();
  const reviewsApiRaw = reviewsApiFromEnv || String(cfg.reviewsApiUrl ?? "").trim();
  const reviewsApiResolved = resolvePublicWebhookApiUrl(reviewsApiRaw, "/webhooks/site-reviews");
  const reviewsApiLocalFromEnv = String(process.env.VC_REVIEWS_API_URL_LOCAL ?? "").trim();
  const reviewsApiLocalRaw = reviewsApiLocalFromEnv || String(cfg.reviewsApiUrlLocal ?? "").trim();
  const reviewsApiLocalResolved =
    reviewsApiLocalRaw && /^https?:\/\//i.test(reviewsApiLocalRaw)
      ? reviewsApiLocalRaw
      : "";
  const suggestionsApiFromEnv = String(process.env.VC_SUGGESTIONS_API_URL ?? "").trim();
  const suggestionsApiRaw = suggestionsApiFromEnv || String(cfg.suggestionsApiUrl ?? "").trim();
  const suggestionsApiResolved = resolvePublicWebhookApiUrl(suggestionsApiRaw, "/webhooks/site-suggestions");
  const suggestionsApiLocalFromEnv = String(process.env.VC_SUGGESTIONS_API_URL_LOCAL ?? "").trim();
  const suggestionsApiLocalRaw =
    suggestionsApiLocalFromEnv || String(cfg.suggestionsApiUrlLocal ?? "").trim();
  const suggestionsApiLocalResolved =
    suggestionsApiLocalRaw && /^https?:\/\//i.test(suggestionsApiLocalRaw)
      ? suggestionsApiLocalRaw
      : "";
  const botFeedbackApiFromEnv = String(process.env.VC_BOT_FEEDBACK_API_URL ?? "").trim();
  const botFeedbackApiRaw = botFeedbackApiFromEnv || String(cfg.botFeedbackApiUrl ?? "").trim();
  const botFeedbackApiResolved = resolvePublicWebhookApiUrl(botFeedbackApiRaw, "/webhooks/site-bot-feedback");
  const botFeedbackApiLocalFromEnv = String(process.env.VC_BOT_FEEDBACK_API_URL_LOCAL ?? "").trim();
  const botFeedbackApiLocalRaw =
    botFeedbackApiLocalFromEnv || String(cfg.botFeedbackApiUrlLocal ?? "").trim();
  const botFeedbackApiLocalResolved =
    botFeedbackApiLocalRaw && /^https?:\/\//i.test(botFeedbackApiLocalRaw)
      ? botFeedbackApiLocalRaw
      : "";
  const webTicketsApiFromEnv = String(process.env.VC_WEB_TICKETS_API_URL ?? "").trim();
  const webTicketsApiRaw = webTicketsApiFromEnv || String(cfg.webTicketsApiUrl ?? "").trim();
  const webTicketsApiResolved = resolvePublicWebhookApiUrl(webTicketsApiRaw, "/webhooks/site-web-tickets");
  const webTicketsApiLocalFromEnv = String(process.env.VC_WEB_TICKETS_API_URL_LOCAL ?? "").trim();
  const webTicketsApiLocalRaw =
    webTicketsApiLocalFromEnv || String(cfg.webTicketsApiUrlLocal ?? "").trim();
  const webTicketsApiLocalResolved =
    webTicketsApiLocalRaw && /^https?:\/\//i.test(webTicketsApiLocalRaw)
      ? webTicketsApiLocalRaw
      : "";
  const rolesApiFromEnv = String(process.env.VC_ROLES_API_URL ?? "").trim();
  const rolesApiRaw = rolesApiFromEnv || String(cfg.rolesApiUrl ?? "").trim();
  const rolesApiResolved = resolvePublicWebhookApiUrl(rolesApiRaw, "/webhooks/site-roles");
  const rolesApiLocalFromEnv = String(process.env.VC_ROLES_API_URL_LOCAL ?? "").trim();
  const rolesApiLocalRaw =
    rolesApiLocalFromEnv || String(cfg.rolesApiUrlLocal ?? "").trim();
  const rolesApiLocalResolved =
    rolesApiLocalRaw && /^https?:\/\//i.test(rolesApiLocalRaw)
      ? rolesApiLocalRaw
      : "";
  const rankCardApiFromEnv = String(process.env.VC_RANK_CARD_API_URL ?? "").trim();
  const rankCardApiRaw = rankCardApiFromEnv || String(cfg.rankCardApiUrl ?? "").trim();
  const rankCardApiResolved =
    rankCardApiRaw && /^https?:\/\//i.test(rankCardApiRaw)
      ? rankCardApiRaw
      : rankCardApiRaw && siteBaseNoSlash
        ? `${siteBaseNoSlash.replace(/\/+$/, "")}${rankCardApiRaw.startsWith("/") ? "" : "/"}${rankCardApiRaw}`
        : siteBaseNoSlash
          ? `${siteBaseNoSlash}/webhooks/site-rank-card`
          : "/webhooks/site-rank-card";
  const rankCardApiLocalFromEnv = String(process.env.VC_RANK_CARD_API_URL_LOCAL ?? "").trim();
  const rankCardApiLocalRaw =
    rankCardApiLocalFromEnv || String(cfg.rankCardApiUrlLocal ?? "").trim();
  const rankCardApiLocalResolved =
    rankCardApiLocalRaw && /^https?:\/\//i.test(rankCardApiLocalRaw)
      ? rankCardApiLocalRaw
      : "";
  const customProfileApiResolved = siteBaseNoSlash
    ? `${siteBaseNoSlash}/webhooks/site-custom-profile`
    : "/webhooks/site-custom-profile";
  const customProfileApiLocalResolved = "";
  const reviewsPageUrl = siteBaseNoSlash ? `${siteBaseNoSlash}/recensioni` : "/recensioni";
  const suggestionsPageUrl = siteBaseNoSlash ? `${siteBaseNoSlash}/suggerimenti` : "/suggerimenti";
  const ticketsPageUrl = siteBaseNoSlash ? `${siteBaseNoSlash}/tickets` : "/tickets";
  const supportoPageUrl = ticketsPageUrl;
  const staffTicketPageUrl = ticketsPageUrl;
  const dashboardPageUrl = siteBaseNoSlash ? `${siteBaseNoSlash}/dashboard` : "/dashboard";
  const dashboardGuildPageUrl = siteBaseNoSlash ? `${siteBaseNoSlash}/dashboard/guild/` : "/dashboard/guild/";
  const dashboardFeedbackPageUrl = siteBaseNoSlash
    ? `${siteBaseNoSlash}/dashboard/feedback/`
    : "/dashboard/feedback/";
  const dashboardSuggestionsPageUrl = dashboardFeedbackPageUrl;
  const dashboardFaqPageUrl = siteBaseNoSlash ? `${siteBaseNoSlash}/dashboard/faq/` : "/dashboard/faq/";
  const dashboardPremiumPageUrl = siteBaseNoSlash
    ? `${siteBaseNoSlash}/dashboard/premium/`
    : "/dashboard/premium/";
  const dashboardPremiumCreditsPageUrl = siteBaseNoSlash
    ? `${siteBaseNoSlash}/dashboard/premium/crediti/`
    : "/dashboard/premium/crediti/";
  const dashboardProfilePageUrl = siteBaseNoSlash
    ? `${siteBaseNoSlash}/dashboard/profilo/`
    : "/dashboard/profilo/";
  const dashboardProfileSubPageUrl = siteBaseNoSlash
    ? `${siteBaseNoSlash}/dashboard/profilo/abbonamento/`
    : "/dashboard/profilo/abbonamento/";
  const dashboardTranscriptPageUrl = siteBaseNoSlash
    ? `${siteBaseNoSlash}/dashboard/transcript/`
    : "/dashboard/transcript/";
  const datiPageUrl = siteBaseNoSlash ? `${siteBaseNoSlash}/dati/` : "/dati/";
  const botReviewsPageUrl = siteBaseNoSlash
    ? `${siteBaseNoSlash}/dashboard/recensioni/`
    : "/dashboard/recensioni/";
  const statusPageUrl = siteBaseNoSlash ? `${siteBaseNoSlash}/status/` : "/status/";
  const premiumCheckoutFromCfg = String(cfg.premiumCheckoutUrl ?? "").trim();
  const discordAppId = String(cfg.discordOauth?.clientId ?? "").trim();
  /** SKU Guild subscription — Vinili Premium (Discord Shop). */
  const premiumStoreSkuId = String(cfg.premiumStoreSkuId ?? "1530970777694896239").trim();
  const premiumCheckoutUrlResolved =
    premiumCheckoutFromCfg ||
    (discordAppId && /^\d{16,22}$/.test(premiumStoreSkuId)
      ? `https://discord.com/discovery/applications/${discordAppId}/store/${premiumStoreSkuId}`
      : discordAppId
        ? `https://discord.com/discovery/applications/${discordAppId}/store`
        : String(cfg.donationsUrl ?? "").trim() || "#");

  let dashboardBotFaqJson = '{"categories":[],"items":[]}';
  try {
    const botFaqPlain = require(path.join(ROOT, "..", "Vinyls", "Utils", "Utility", "botFaqPlainData.js"));
    dashboardBotFaqJson = JSON.stringify(botFaqPlain.getBotFaqWebPayload());
  } catch (err) {
    console.warn("[build-site] FAQ bot non caricata:", err?.message || err);
  }
  const dashboardApiFromEnv = String(process.env.VC_DASHBOARD_API_URL ?? "").trim();
  const dashboardApiRaw = dashboardApiFromEnv || String(cfg.dashboardApiUrl ?? "").trim();
  const dashboardApiResolved = resolvePublicWebhookApiUrl(dashboardApiRaw, "/webhooks/site-dashboard");
  const dashboardApiLocalFromEnv = String(process.env.VC_DASHBOARD_API_URL_LOCAL ?? "").trim();
  const dashboardApiLocalRaw =
    dashboardApiLocalFromEnv || String(cfg.dashboardApiUrlLocal ?? "").trim();
  const dashboardApiLocalResolved =
    dashboardApiLocalRaw && /^https?:\/\//i.test(dashboardApiLocalRaw)
      ? dashboardApiLocalRaw
      : "";
  const userPageUrl = siteBaseNoSlash ? `${siteBaseNoSlash}/user` : "/user";
  const ruoliPageUrl = siteBaseNoSlash ? `${siteBaseNoSlash}/ruoli` : "/ruoli";
  if (discordOauthRedirectResolved) {
    buildInfoLog(
      "[build-site] OAuth2 Redirect (Discord Developer Portal): registra solo questa callback (stesso redirect da tutte le pagine; il ritorno alla pagina corretta usa state):",
      JSON.stringify(discordOauthRedirectResolved),
    );
    if (discordOauthRedirectNoSlash !== discordOauthRedirectResolved) {
      buildInfoLog(
        "[build-site] Se in portale hai solo la variante senza slash finale, aggiungi anche:",
        JSON.stringify(discordOauthRedirectNoSlash),
      );
    }
    buildInfoLog(
      "[build-site] Stessa applicazione (client_id), sezione OAuth2: attiva «Implicit Grant» se usi response_type=token.",
    );
  }

  const buildAssetVersion = String(Date.now());
  const map = {
    COOKIEYES_BLOCK: cookieYesBlock,
    GA_BLOCK: gaBlock,
    HERO_BANNER_BLOCK: "",
    GUILD_ICON_URL: escAttr(guildIconUrl),
    OG_IMAGE_URL: escAttr(ogImageUrl),
    OG_IMAGE_WIDTH: escAttr(ogImageWidth),
    OG_IMAGE_HEIGHT: escAttr(ogImageHeight),
    OG_IMAGE_ALT: escAttr(ogImageAlt),
    OG_SITE_NAME: escAttr(ogSiteName),
    THEME_COLOR_HEX: escAttr(themeColorHex),
    OG_TITLE: escAttr(ogTitle),
    OG_DESCRIPTION: escAttr(ogDesc),
    OG_URL: escAttr(ogUrl),
    STAFF_LIST_BLOCK: staffResult.html,
    LIVE_STATS_BOOT: liveStatsBoot,
    LIVE_STATS_BOOT_WIKI: liveStatsBootWiki,
    LIVE_STATS_BOOT_USER: liveStatsBootUser,
    ABOUT_DESCRIPTION: escHtml(aboutPlain),
    SITE_NAME: siteName,
    SITE_URL: escAttr(siteUrlTrim),
    BUILD_ASSET_VERSION: buildAssetVersion,
    TERMS_URL: escAttr(termsUrlResolved),
    PRIVACY_URL: escAttr(privacyUrlResolved),
    COOKIE_POLICY_URL: escAttr(cookiePolicyUrlResolved),
    COPYRIGHT_URL: escAttr(copyrightUrlResolved),
    COPYRIGHT_OG_TITLE: escAttr(`${siteName} | Copyright e Licenza`),
    COPYRIGHT_OG_DESCRIPTION: escAttr(
      `Avviso di copyright e licenza proprietaria di ${siteName}.`,
    ),
    NOTIFICATIONS_URL: escAttr(defaultLegalPath("notifications")),
    USER_PERSONALIZZA_URL: escAttr(defaultLegalPath("user/personalizza")),
    LEGAL_TERMS_UPDATED: escHtml(legalTermsDate),
    LEGAL_PRIVACY_UPDATED: escHtml(legalPrivacyDate),
    LEGAL_COOKIE_UPDATED: escHtml(legalCookieDate),
    COOKIE_OG_TITLE: escAttr(`${siteName} | Cookie Policy`),
    COOKIE_OG_DESCRIPTION: escAttr(
      `Cookie Policy del sito ${siteName}: cookie tecnici, sicurezza, durata e gestione.`,
    ),
    TERMS_OG_TITLE: escAttr(`${siteName} | Termini di Servizio`),
    TERMS_OG_DESCRIPTION: escAttr(`Termini di Servizio del sito e del server Discord ${siteName}.`),
    PRIVACY_OG_TITLE: escAttr(`${siteName} | Privacy Policy`),
    PRIVACY_OG_DESCRIPTION: escAttr(`Informativa sulla privacy per il sito e la community ${siteName}.`),
    USER_RANK_CUSTOMIZE_OG_TITLE: escAttr(`${siteName} | Personalizza rank card`),
    USER_RANK_CUSTOMIZE_OG_DESCRIPTION: escAttr(`Personalizza la tua rank card direttamente dal sito.`),
    USER_PERSONALIZZA_OG_URL: escAttr(siteBaseNoSlash ? `${siteBaseNoSlash}/user/personalizza` : ""),
    USER_CUSTOMIZE_OG_URL: escAttr(siteBaseNoSlash ? `${siteBaseNoSlash}/user/customize` : ""),
    DISCORD_INVITE_DISPLAY: escHtml(discordInviteDisplay),
    SUPPORT_MAILTO: supEmail ? escAttr(`mailto:${supEmail}`) : escAttr("#"),
    VOTE_URL: escAttr(votePageUrl),
    DISCADIA_VOTE_URL: escAttr(discadiaVoteUrlResolved),
    TOPGG_VOTE_URL: escAttr(topggVoteUrlResolved),
    REVIEWS_URL: cfg.reviewsUrl || "https://disboard.org/it/server/1329080093599076474",
    DONATIONS_URL: escAttr(donationsPageUrl),
    PERKS_URL: escAttr(perksPageUrl),
    PAYPAL_DONATIONS_URL: escAttr(paypalDonationsUrlResolved),
    DISCORD_OAUTH_CLIENT_ID: String(cfg.discordOauth?.clientId || "").trim(),
    DISCORD_OAUTH_REDIRECT_URI: discordOauthRedirectResolved,
    DISCORD_INVITE_URL: discordInviteResolved,
    DISCORD_GUILD_ID: escAttr(guildIdResolved || "1329080093599076474"),
    DISCORD_SPONSOR_TICKETS_MESSAGE_URL: escAttr(discordSponsorTicketsMessageResolved),
    WIKI_URL: escAttr(wikiUrlResolved),
    SPONSOR_URL: escAttr(sponsorUrlResolved),
    FAQ_URL: escAttr(faqUrlResolved),
    COMMUNITY_RULES_URL: escAttr(communityRulesUrlResolved),
    RICHIESTE_UNBAN_URL: escAttr(richiesteUnbanUrl),
    RICHIESTE_UNMUTE_URL: escAttr(richiesteUnmuteUrl),
    RICHIESTE_CANDIDATURE_URL: escAttr(richiesteCandidatureUrl),
    RICHIESTE_SUGGERIMENTI_URL: escAttr(richiesteSuggerimentiUrl),
    CANDIDATURE_PAGE_TITLE: `${siteName} | Candidature staff`,
    CANDIDATURE_META_DESCRIPTION: escAttr(
      `Candidature Helper e Partner Manager: requisiti e modulo per ${siteName} su Discord.`,
    ),
    CANDIDATURE_OG_TITLE: escAttr(`${siteName} | Candidature`),
    CANDIDATURE_OG_URL: escAttr(siteBaseNoSlash ? `${siteBaseNoSlash}/candidature` : ""),
    CANDIDATURE_SUBMIT_API_URL: escAttr(candidatureSubmitApiResolved),
    CANDIDATURE_SUBMIT_API_URL_LOCAL: escAttr(distApiLocal(candidatureSubmitApiLocalResolved)),
    UNBAN_SUBMIT_API_URL: escAttr(unbanSubmitApiResolved),
    UNBAN_SUBMIT_API_URL_LOCAL: escAttr(distApiLocal(unbanSubmitApiLocalResolved)),
    UNMUTE_SUBMIT_API_URL: escAttr(unmuteSubmitApiResolved),
    UNMUTE_SUBMIT_API_URL_LOCAL: escAttr(distApiLocal(unmuteSubmitApiLocalResolved)),
    COMMUNITY_RULES_API_URL: escAttr(communityRulesApiResolved),
    COMMUNITY_RULES_API_URL_LOCAL: escAttr(distApiLocal(communityRulesApiLocalResolved)),
    USER_PAGE_URL: escAttr(userPageUrl),
    RUOLI_PAGE_URL: escAttr(ruoliPageUrl),
    USERS_LEADERBOARD_API_URL: escAttr(usersLeaderboardApiResolved),
    USERS_LEADERBOARD_API_URL_LOCAL: escAttr(distApiLocal(usersLeaderboardApiLocalResolved)),
    VOTE_API_URL: escAttr(voteApiResolved),
    VOTE_API_URL_LOCAL: escAttr(distApiLocal(voteApiLocalResolved)),
    SITE_NOTIFICATIONS_API_URL: escAttr(siteNotifsApiResolved),
    SITE_NOTIFICATIONS_API_URL_LOCAL: escAttr(distApiLocal(siteNotifsApiLocalResolved)),
    SERATAFILM_ACCESS_API_URL: escAttr(seratafilmAccessApiResolved),
    SERATAFILM_ACCESS_API_URL_LOCAL: escAttr(distApiLocal(seratafilmAccessApiLocalResolved)),
    STAFF_ACCESS_API_URL: escAttr(staffAccessApiResolved),
    STAFF_ACCESS_API_URL_LOCAL: escAttr(distApiLocal(staffAccessApiLocalResolved)),
    STAFF_PAUSE_API_URL: escAttr(staffPauseApiResolved),
    STAFF_PAUSE_API_URL_LOCAL: escAttr(distApiLocal(staffPauseApiLocalResolved)),
    STAFF_PROFILE_API_URL: escAttr(staffProfileApiResolved),
    STAFF_PROFILE_API_URL_LOCAL: escAttr(distApiLocal(staffProfileApiLocalResolved)),
    STAFF_PM_HUB_API_URL: escAttr(staffPmHubApi.resolved),
    STAFF_PM_HUB_API_URL_LOCAL: escAttr(distApiLocal(staffPmHubApi.localResolved)),
    STAFF_PM_SHOP_API_URL: escAttr(staffPmShopApi.resolved),
    STAFF_PM_SHOP_API_URL_LOCAL: escAttr(distApiLocal(staffPmShopApi.localResolved)),
    STAFF_PM_POINTS_REMOVED_API_URL: escAttr(staffPmPointsRemovedApi.resolved),
    STAFF_PM_POINTS_REMOVED_API_URL_LOCAL: escAttr(distApiLocal(staffPmPointsRemovedApi.localResolved)),
    STAFF_TICKETS_API_URL: escAttr(staffTicketsApi.resolved),
    STAFF_TICKETS_API_URL_LOCAL: escAttr(distApiLocal(staffTicketsApi.localResolved)),
    STAFF_SERATAFILM_API_URL: escAttr(staffSerataFilmApi.resolved),
    STAFF_SERATAFILM_API_URL_LOCAL: escAttr(distApiLocal(staffSerataFilmApi.localResolved)),
    STAFF_GUIDE_API_URL: escAttr(staffGuideApi.resolved),
    STAFF_GUIDE_API_URL_LOCAL: escAttr(distApiLocal(staffGuideApi.localResolved)),
    STAFF_DASHBOARD_API_URL: escAttr(staffDashboardApi.resolved),
    STAFF_DASHBOARD_API_URL_LOCAL: escAttr(distApiLocal(staffDashboardApi.localResolved)),
    STAFF_MANAGE_API_URL: escAttr(staffManageApi.resolved),
    STAFF_MANAGE_API_URL_LOCAL: escAttr(distApiLocal(staffManageApi.localResolved)),
    STAFF_ORGANICO_API_URL: escAttr(staffOrganicoApi.resolved),
    STAFF_ORGANICO_API_URL_LOCAL: escAttr(distApiLocal(staffOrganicoApi.localResolved)),
    HOGWARTS_SORTING_API_URL: escAttr(hogwartsSortingApiResolved),
    HOGWARTS_SORTING_API_URL_LOCAL: escAttr(distApiLocal(hogwartsSortingApiLocalResolved)),
    HOGWARTS_SHOP_API_URL: escAttr(`${hogwartsSortingApiResolved.replace(/\/+$/, "")}/shop`),
    HOGWARTS_SHOP_API_URL_LOCAL: escAttr(distApiLocal(hogwartsSortingApiLocalResolved ? `${hogwartsSortingApiLocalResolved.replace(/\/+$/, "")}/shop` : "")),
    HOGWARTS_POTIONS_API_URL: escAttr(`${hogwartsSortingApiResolved.replace(/\/+$/, "")}/potions`),
    HOGWARTS_POTIONS_API_URL_LOCAL: escAttr(distApiLocal(hogwartsSortingApiLocalResolved ? `${hogwartsSortingApiLocalResolved.replace(/\/+$/, "")}/potions` : "")),
    HOGWARTS_POTIONS_START_DATE: escAttr(hogwartsPotionsStartDate),
    HOGWARTS_POTIONS_REDIRECT_URL: escAttr(hogwartsPotionsRedirectUrl),
    HOGWARTS_CRESTS_PATH: escAttr(hogwartsCrestsPath),
    HOGWARTS_INTRO_VIDEO: escAttr(hogwartsIntroVideo),
    HOGWARTS_INTRO_DURATION_SEC: String(hogwartsIntroDurationSec),
    HOGWARTS_INTRO_TRIM_END_SEC: String(hogwartsIntroTrimEndSec),
    HOGWARTS_CRESTS_CACHE_BUST: buildAssetVersion,
    HOGWARTS_STATIC_BOOTSTRAP_URI: hogwartsStaticBootstrapUri,
    HOGWARTS_POINTS_URI: hogwartsPointsUri,
    HOGWARTS_BGM_URI: hogwartsBgmUri,
    HOGWARTS_BGM_JSON: hogwartsBgmJson,
    HOGWARTS_SORTING_PAGE_URL: escAttr(hogwartsSortingPageUrl),
    HOGWARTS_POINTS_PAGE_URL: escAttr(hogwartsPointsPageUrl),
    HOGWARTS_SHOP_PAGE_URL: escAttr(hogwartsShopPageUrl),
    HOGWARTS_POTIONS_PAGE_URL: escAttr(hogwartsPotionsPageUrl),
    HOGWARTS_HUB_PAGE_URL: escAttr(hogwartsHubPageUrl),
    HOGWARTS_EVENT_HEADER: hogwartsEventHeaderFor("hub"),
    HOGWARTS_EVENT_WINDOW_LABEL: escHtml(hogwartsEventWindowLabel),
    HOGWARTS_EVENT_CALENDAR_JSON: hogwartsEventCalendarJsonEscaped,
    HOGWARTS_HUB_PAGE_TITLE: escAttr(`${siteName} | Evento Hogwarts`),
    HOGWARTS_HUB_META_DESCRIPTION: escAttr(
      `Calendario settimanale dell'evento Hogwarts ${siteName}: smistamento, shop, pozioni, coppa e attività Discord.`,
    ),
    HOGWARTS_HUB_OG_TITLE: escAttr(`${siteName} | Evento Hogwarts`),
    HOGWARTS_HUB_OG_URL: escAttr(hogwartsHubPageUrl),
    HOGWARTS_SORTING_PAGE_TITLE: escAttr(`${siteName} | Smistamento Hogwarts`),
    HOGWARTS_SORTING_META_DESCRIPTION: escAttr(
      `Quiz di smistamento Harry Potter: scopri la tua casa a Hogwarts nell'evento estivo ${siteName}.`,
    ),
    HOGWARTS_SORTING_OG_TITLE: escAttr(`${siteName} | Smistamento Hogwarts`),
    HOGWARTS_SORTING_OG_URL: escAttr(hogwartsSortingPageUrl),
    HOGWARTS_POINTS_PAGE_TITLE: escAttr(`${siteName} | Punti Hogwarts`),
    HOGWARTS_POINTS_META_DESCRIPTION: escAttr(
      `Clessidre delle case di Hogwarts: segui i punti di Grifondoro, Corvonero, Tassorosso e Serpeverde nell'evento ${siteName}.`,
    ),
    HOGWARTS_POINTS_OG_TITLE: escAttr(`${siteName} | Punti Hogwarts`),
    HOGWARTS_POINTS_OG_URL: escAttr(hogwartsPointsPageUrl),
    HOGWARTS_SHOP_PAGE_TITLE: escAttr(`${siteName} | Shop Hogwarts`),
    HOGWARTS_SHOP_META_DESCRIPTION: escAttr(
      `Shop Hogwarts ${siteName}: acquista bacchette, scope e animali usando i Galeoni d'Oro dell'evento.`,
    ),
    HOGWARTS_SHOP_OG_TITLE: escAttr(`${siteName} | Shop Hogwarts`),
    HOGWARTS_SHOP_OG_URL: escAttr(hogwartsShopPageUrl),
    HOGWARTS_POTIONS_PAGE_TITLE: escAttr(`${siteName} | Pozioni Hogwarts`),
    HOGWARTS_POTIONS_META_DESCRIPTION: escAttr(
      `Pozioni Hogwarts ${siteName}: abbina pozioni ed effetti nel minigioco da 12 ore dell'evento.`,
    ),
    HOGWARTS_POTIONS_OG_TITLE: escAttr(`${siteName} | Pozioni Hogwarts`),
    HOGWARTS_POTIONS_OG_URL: escAttr(hogwartsPotionsPageUrl),
    SERATAFILM_BGM_URI: seratafilmBgmUri,
    SERATAFILM_EVENT_URI: seratafilmEventUri,
    REVIEWS_PAGE_URL: escAttr(reviewsPageUrl),
    BOT_REVIEWS_PAGE_URL: escAttr(botReviewsPageUrl),
    REVIEWS_API_URL: escAttr(reviewsApiResolved),
    REVIEWS_API_URL_LOCAL: escAttr(distApiLocal(reviewsApiLocalResolved)),
    SUGGESTIONS_PAGE_URL: escAttr(suggestionsPageUrl),
    SUGGESTIONS_API_URL: escAttr(suggestionsApiResolved),
    SUGGESTIONS_API_URL_LOCAL: escAttr(distApiLocal(suggestionsApiLocalResolved)),
    BOT_FEEDBACK_API_URL: escAttr(botFeedbackApiResolved),
    BOT_FEEDBACK_API_URL_LOCAL: escAttr(distApiLocal(botFeedbackApiLocalResolved)),
    WEB_TICKETS_API_URL: escAttr(webTicketsApiResolved),
    WEB_TICKETS_API_URL_LOCAL: escAttr(distApiLocal(webTicketsApiLocalResolved)),
    TICKETS_PAGE_URL: escAttr(ticketsPageUrl),
    SUPPORTO_PAGE_URL: escAttr(supportoPageUrl),
    STAFF_TICKET_PAGE_URL: escAttr(staffTicketPageUrl),
    TICKETS_PAGE_TITLE: escAttr(`${siteName} | Ticket`),
    TICKETS_META_DESCRIPTION: escAttr(
      "Apri un ticket live sul sito e chatta con lo staff in tempo reale con il tuo account Discord.",
    ),
    TICKETS_OG_TITLE: escAttr(`${siteName} | Ticket live`),
    TICKETS_OG_URL: escAttr(ticketsPageUrl),
    SUPPORTO_PAGE_TITLE: escAttr(`${siteName} | Ticket`),
    SUPPORTO_META_DESCRIPTION: escAttr(
      `Apri un ticket e parla in tempo reale con lo staff di ${siteName} direttamente dal sito.`,
    ),
    SUPPORTO_OG_TITLE: escAttr(`${siteName} | Supporto live`),
    SUPPORTO_OG_URL: escAttr(supportoPageUrl),
    DASHBOARD_PAGE_URL: escAttr(dashboardPageUrl),
    DASHBOARD_GUILD_PAGE_URL: escAttr(dashboardGuildPageUrl),
    DASHBOARD_SUGGESTIONS_PAGE_URL: escAttr(dashboardSuggestionsPageUrl),
    DASHBOARD_FAQ_PAGE_URL: escAttr(dashboardFaqPageUrl),
    DASHBOARD_PREMIUM_PAGE_URL: escAttr(dashboardPremiumPageUrl),
    DASHBOARD_PREMIUM_CREDITS_PAGE_URL: escAttr(dashboardPremiumCreditsPageUrl),
    DASHBOARD_PREMIUM_CHECKOUT_URL: escAttr(premiumCheckoutUrlResolved),
    DASHBOARD_PROFILE_PAGE_URL: escAttr(dashboardProfilePageUrl),
    DASHBOARD_PROFILE_SUB_PAGE_URL: escAttr(dashboardProfileSubPageUrl),
    DATI_PAGE_URL: escAttr(datiPageUrl),
    DASHBOARD_BOT_FAQ_JSON: dashboardBotFaqJson,
    STATUS_URL: escAttr(statusPageUrl),
    STATUS_PAGE_URL: escAttr(statusPageUrl),
    DASHBOARD_API_URL: escAttr(dashboardApiResolved),
    DASHBOARD_API_URL_LOCAL: escAttr(distApiLocal(dashboardApiLocalResolved)),
    ROLES_API_URL: escAttr(rolesApiResolved),
    ROLES_API_URL_LOCAL: escAttr(distApiLocal(rolesApiLocalResolved)),
    RANK_CARD_API_URL: escAttr(rankCardApiResolved),
    RANK_CARD_API_URL_LOCAL: escAttr(distApiLocal(rankCardApiLocalResolved)),
    CUSTOM_PROFILE_API_URL: escAttr(customProfileApiResolved),
    CUSTOM_PROFILE_API_URL_LOCAL: escAttr(distApiLocal(customProfileApiLocalResolved)),
    USER_PAGE_TITLE: `${siteName} | Community · Classifica`,
    USER_META_DESCRIPTION: escAttr(
      `Classifica livelli ed EXP del server Discord ${siteName}: utenti ordinati per esperienza totale.`,
    ),
    USER_OG_TITLE: escAttr(`${siteName} | Community`),
    USER_OG_URL: escAttr(userPageUrl),
    RUOLI_PAGE_TITLE: `${siteName} | Ruoli Personalizzati`,
    RUOLI_META_DESCRIPTION: escAttr(
      `Tutti i ruoli personalizzati creati con +profile nella community Discord ${siteName}.`,
    ),
    RUOLI_OG_TITLE: escAttr(`${siteName} | Ruoli Personalizzati`),
    RUOLI_OG_URL: escAttr(ruoliPageUrl),
    REGOLE_PAGE_TITLE: `${siteName} | Regole della community`,
    REGOLE_META_DESCRIPTION: escAttr(`Regole del server Discord ${siteName}: generali, chat testuali e vocali.`),
    REGOLE_OG_TITLE: escAttr(`${siteName} | Regole`),
    REGOLE_OG_URL: escAttr(siteBaseNoSlash ? `${siteBaseNoSlash}/regole` : ""),
    DONAZIONI_PAGE_TITLE: `${siteName} | Donazioni`,
    DONAZIONI_META_DESCRIPTION: escAttr(
      `Supporta ${siteName} con una donazione e aiutaci a mantenere bot, sito e infrastruttura della community.`,
    ),
    DONAZIONI_OG_TITLE: escAttr(`${siteName} | Donazioni`),
    DONAZIONI_OG_URL: escAttr(donationsPageUrl),
    PERKS_PAGE_TITLE: `${siteName} | Perks`,
    PERKS_META_DESCRIPTION: escAttr(
      `Perks boost Nitro, livelli EXP, badge e verifica selfie della community Discord ${siteName}: riepilogo vantaggi.`,
    ),
    PERKS_OG_TITLE: escAttr(`${siteName} | Perks`),
    PERKS_OG_URL: escAttr(perksPageUrl),
    VOTE_PAGE_TITLE: `${siteName} | Vota`,
    VOTE_META_DESCRIPTION: escAttr(
      `Vota ${siteName} su Discadia e Top.gg, supporta la community e ottieni ricompense.`,
    ),
    VOTE_OG_TITLE: escAttr(`${siteName} | Vota`),
    VOTE_OG_URL: escAttr(votePageUrl),
    REVIEWS_PAGE_TITLE: `${siteName} | Recensioni`,
    REVIEWS_META_DESCRIPTION: escAttr(
      `Recensioni della community di ${siteName}: leggi i feedback sul server e lascia la tua opinione.`,
    ),
    REVIEWS_OG_TITLE: escAttr(`${siteName} | Recensioni`),
    REVIEWS_OG_URL: escAttr(reviewsPageUrl),
    BOT_REVIEWS_PAGE_TITLE: `${siteName} | Recensioni`,
    BOT_REVIEWS_META_DESCRIPTION: escAttr(
      `Recensioni di ViniliCaffeBot: feedback su musica, partnership e strumenti, filtrabili per lingua.`,
    ),
    BOT_REVIEWS_OG_TITLE: escAttr(`${siteName} | Recensioni`),
    BOT_REVIEWS_OG_URL: escAttr(botReviewsPageUrl),
    SUGGESTIONS_PAGE_TITLE: `${siteName} | Suggerimenti`,
    SUGGESTIONS_META_DESCRIPTION: escAttr(
      `Suggerimenti per ${siteName}: proponi idee, commenta le proposte e segui le decisioni dell'High Staff.`,
    ),
    SUGGESTIONS_OG_TITLE: escAttr(`${siteName} | Suggerimenti`),
    SUGGESTIONS_OG_URL: escAttr(suggestionsPageUrl),
    DASHBOARD_PAGE_TITLE: `${siteName} | Dashboard`,
    DASHBOARD_META_DESCRIPTION: escAttr(`Dashboard bot di ${siteName}.`),
    DASHBOARD_OG_TITLE: escAttr(`${siteName} | Dashboard`),
    DASHBOARD_OG_URL: escAttr(dashboardPageUrl),
    DASHBOARD_GUILD_PAGE_TITLE: `${siteName} | Dashboard server`,
    DASHBOARD_GUILD_META_DESCRIPTION: escAttr(`Configurazione server — dashboard ${siteName}.`),
    DASHBOARD_GUILD_OG_TITLE: escAttr(`${siteName} | Dashboard server`),
    DASHBOARD_GUILD_OG_URL: escAttr(dashboardGuildPageUrl),
    DASHBOARD_SUGGESTIONS_PAGE_TITLE: `${siteName} | Feedback bot`,
    DASHBOARD_SUGGESTIONS_META_DESCRIPTION: escAttr(
      `Feedback su Vinili: idee, miglioramenti e segnalazioni bug — dashboard ${siteName}.`,
    ),
    DASHBOARD_SUGGESTIONS_OG_TITLE: escAttr(`${siteName} | Feedback bot`),
    DASHBOARD_SUGGESTIONS_OG_URL: escAttr(dashboardSuggestionsPageUrl),
    DASHBOARD_FAQ_PAGE_TITLE: `${siteName} | FAQ bot`,
    DASHBOARD_FAQ_META_DESCRIPTION: escAttr(
      `FAQ di ViniliCaffeBot: setup, settings, partnership, punti e status — dashboard ${siteName}.`,
    ),
    DASHBOARD_FAQ_OG_TITLE: escAttr(`${siteName} | FAQ bot`),
    DASHBOARD_FAQ_OG_URL: escAttr(dashboardFaqPageUrl),
    DASHBOARD_PREMIUM_PAGE_TITLE: `${siteName} | Premium`,
    DASHBOARD_PREMIUM_META_DESCRIPTION: escAttr(
      `Vinili Premium — personalizza avatar, banner, nome e embed di ringraziamento su ${siteName}.`,
    ),
    DASHBOARD_PREMIUM_OG_TITLE: escAttr(`${siteName} | Premium`),
    DASHBOARD_PREMIUM_OG_URL: escAttr(dashboardPremiumPageUrl),
    DASHBOARD_PREMIUM_CREDITS_PAGE_TITLE: `${siteName} | Crediti Premium`,
    DASHBOARD_PREMIUM_CREDITS_META_DESCRIPTION: escAttr(
      `Acquista pacchetti crediti Premium (20, 30, 40) per Vinili su ${siteName}.`,
    ),
    DASHBOARD_PREMIUM_CREDITS_OG_TITLE: escAttr(`${siteName} | Crediti Premium`),
    DASHBOARD_PREMIUM_CREDITS_OG_URL: escAttr(dashboardPremiumCreditsPageUrl),
    DASHBOARD_PROFILE_PAGE_TITLE: `${siteName} | Profilo`,
    DASHBOARD_PROFILE_META_DESCRIPTION: escAttr(
      `Il tuo profilo sulla dashboard ${siteName}: punti, obiettivi, badge e preferenze.`,
    ),
    DASHBOARD_PROFILE_OG_TITLE: escAttr(`${siteName} | Profilo`),
    DASHBOARD_PROFILE_OG_URL: escAttr(dashboardProfilePageUrl),
    DASHBOARD_PROFILE_SUB_PAGE_TITLE: `${siteName} | Abbonamento`,
    DASHBOARD_PROFILE_SUB_META_DESCRIPTION: escAttr(
      `Stato, rinnovo e dettagli abbonamento Vinili Premium su ${siteName}.`,
    ),
    DASHBOARD_PROFILE_SUB_OG_TITLE: escAttr(`${siteName} | Abbonamento`),
    DASHBOARD_PROFILE_SUB_OG_URL: escAttr(dashboardProfileSubPageUrl),
    DASHBOARD_TRANSCRIPT_PAGE_TITLE: `${siteName} | Transcript`,
    DASHBOARD_TRANSCRIPT_META_DESCRIPTION: escAttr(`Transcript del ticket — accesso riservato su ${siteName}.`),
    DASHBOARD_TRANSCRIPT_OG_TITLE: escAttr(`${siteName} | Transcript`),
    DASHBOARD_TRANSCRIPT_OG_URL: escAttr(dashboardTranscriptPageUrl),
    DATI_PAGE_TITLE: `${siteName} | I tuoi dati`,
    DATI_META_DESCRIPTION: escAttr(
      `Esporta o richiedi la cancellazione dei tuoi dati (GDPR) su ${siteName}.`,
    ),
    DATI_OG_TITLE: escAttr(`${siteName} | I tuoi dati`),
    FAQ_PAGE_TITLE: `${siteName} | FAQ`,
    FAQ_META_DESCRIPTION: escAttr(
      `Domande frequenti su ${siteName}: EXP e livelli, vocali, giochi, eventi e come entrare nello staff.`,
    ),
    FAQ_OG_TITLE: escAttr(`${siteName} | FAQ`),
    FAQ_OG_URL: escAttr(siteBaseNoSlash ? `${siteBaseNoSlash}/faq` : ""),
    SPONSOR_PAGE_TITLE: `${siteName} | Sponsor`,
    SPONSOR_META_DESCRIPTION: escAttr(
      `Sponsor e collaborazioni a pagamento su ${siteName}: canale privato, news e sponsor generali, prezzi e durate.`,
    ),
    SPONSOR_OG_TITLE: escAttr(`${siteName} | Sponsor`),
    SPONSOR_OG_URL: escAttr(siteBaseNoSlash ? `${siteBaseNoSlash}/sponsor` : ""),
    SPONSOR_PROMO_UNTIL: escAttr(String(cfg.sponsorPromoUntil || "").trim()),
    SPONSOR_PROMO_UNTIL_LABEL: escHtml(formatSponsorPromoUntilLabel(cfg.sponsorPromoUntil)),
    META_DESCRIPTION: cfg.metaDescription || "",
    META_KEYWORDS: cfg.metaKeywords || "",
    SUPPORT_EMAIL: cfg.supportEmail || "",
    SITE_MODERATOR_EMAIL: cfg.siteModeratorEmail || cfg.supportEmail || "",
    SITE_ADMIN_EMAIL: cfg.siteAdminEmail || cfg.supportEmail || "",
    FOUNDED_DISPLAY: foundedDisplay,
    STAT_MEMBERS: statMembers,
    STAT_BOOSTS: statBoosts,
    STAT_STAFF: statStaff,
    YEAR: year,
    INSTAGRAM_LI_INTRO: "",
    INSTAGRAM_LI_FOOTER: "",
    FOOTER_SOCIAL_LEFT: footerSocialLeft,
    FOOTER_SOCIAL_RIGHT: footerSocialRight,
    INSTAGRAM_URL: escAttr(instagramUrlResolved || "#"),
    TIKTOK_URL: escAttr(tiktokUrlResolved || "#"),
    WIKI_PAGE_TITLE: `${siteName} | Wiki`,
    WIKI_META_DESCRIPTION: escAttr(
      `Documentazione, comandi e guide del server ${siteName} su Discord.`,
    ),
    WIKI_OG_URL: escAttr(siteBaseNoSlash ? `${siteBaseNoSlash}/wiki` : ""),
    WIKI_OG_TITLE: escAttr(`${siteName} | Wiki`),
    WIKI_BOT_VINILI_AVATAR_URL: escAttr(wikiViniliAvatarUrl),
    WIKI_BOT_CAFFE_AVATAR_URL: escAttr(wikiCaffeAvatarUrl),
    WIKI_CMD_PANES_HTML,
    WIKI_ECONOMY_UNLOCK_MS:
      wikiEconomyUnlockMs != null && Number.isFinite(Number(wikiEconomyUnlockMs))
        ? String(Math.floor(Number(wikiEconomyUnlockMs)))
        : "null",
  };

  html = applyPlaceholderMap(html, map);
  warnLeftoverPlaceholders(html, "index.html");

  fs.writeFileSync(indexPath, html, "utf8");

  const wikiIndexPath = path.join(DIST, "wiki", "index.html");
  if (fs.existsSync(wikiIndexPath)) {
    let wikiHtml = fs.readFileSync(wikiIndexPath, "utf8");
    wikiHtml = applyPlaceholderMap(wikiHtml, map);
    warnLeftoverPlaceholders(wikiHtml, "wiki/index.html");
    fs.writeFileSync(wikiIndexPath, wikiHtml, "utf8");
  } else {
    console.warn("[build-site] Manca wiki/index.html (saltato placeholder).");
  }

  const candidatureIndexPath = path.join(DIST, "candidature", "index.html");
  if (fs.existsSync(candidatureIndexPath)) {
    let candidatureHtml = fs.readFileSync(candidatureIndexPath, "utf8");
    candidatureHtml = applyPlaceholderMap(candidatureHtml, map);
    warnLeftoverPlaceholders(candidatureHtml, "candidature/index.html");
    fs.writeFileSync(candidatureIndexPath, candidatureHtml, "utf8");
  } else {
    console.warn("[build-site] Manca candidature/index.html (saltato placeholder).");
  }
  const unbanIndexPath = path.join(DIST, "unban", "index.html");
  if (fs.existsSync(unbanIndexPath)) {
    let unbanHtml = fs.readFileSync(unbanIndexPath, "utf8");
    unbanHtml = applyPlaceholderMap(unbanHtml, map);
    warnLeftoverPlaceholders(unbanHtml, "unban/index.html");
    fs.writeFileSync(unbanIndexPath, unbanHtml, "utf8");
  } else {
    console.warn("[build-site] Manca unban/index.html (saltato placeholder).");
  }
  const appelliIndexPath = path.join(DIST, "appelli", "index.html");
  if (fs.existsSync(appelliIndexPath)) {
    let appelliHtml = fs.readFileSync(appelliIndexPath, "utf8");
    appelliHtml = applyPlaceholderMap(appelliHtml, map);
    warnLeftoverPlaceholders(appelliHtml, "appelli/index.html");
    fs.writeFileSync(appelliIndexPath, appelliHtml, "utf8");
  } else {
    console.warn("[build-site] Manca appelli/index.html (saltato placeholder).");
  }
  const unmuteIndexPath = path.join(DIST, "unmute", "index.html");
  if (fs.existsSync(unmuteIndexPath)) {
    let unmuteHtml = fs.readFileSync(unmuteIndexPath, "utf8");
    unmuteHtml = applyPlaceholderMap(unmuteHtml, map);
    warnLeftoverPlaceholders(unmuteHtml, "unmute/index.html");
    fs.writeFileSync(unmuteIndexPath, unmuteHtml, "utf8");
  } else {
    console.warn("[build-site] Manca unmute/index.html (saltato placeholder).");
  }
  const candidatureAccessRequiredPath = path.join(DIST, "candidature", "accesso-richiesto", "index.html");
  if (fs.existsSync(candidatureAccessRequiredPath)) {
    let arHtml = fs.readFileSync(candidatureAccessRequiredPath, "utf8");
    arHtml = applyPlaceholderMap(arHtml, map);
    warnLeftoverPlaceholders(arHtml, "candidature/accesso-richiesto/index.html");
    fs.writeFileSync(candidatureAccessRequiredPath, arHtml, "utf8");
  }
  const unbanAccessRequiredPath = path.join(DIST, "unban", "accesso-richiesto", "index.html");
  if (fs.existsSync(unbanAccessRequiredPath)) {
    let arHtml = fs.readFileSync(unbanAccessRequiredPath, "utf8");
    arHtml = applyPlaceholderMap(arHtml, map);
    warnLeftoverPlaceholders(arHtml, "unban/accesso-richiesto/index.html");
    fs.writeFileSync(unbanAccessRequiredPath, arHtml, "utf8");
  }
  const appelliAccessRequiredPath = path.join(DIST, "appelli", "accesso-richiesto", "index.html");
  if (fs.existsSync(appelliAccessRequiredPath)) {
    let arHtml = fs.readFileSync(appelliAccessRequiredPath, "utf8");
    arHtml = applyPlaceholderMap(arHtml, map);
    warnLeftoverPlaceholders(arHtml, "appelli/accesso-richiesto/index.html");
    fs.writeFileSync(appelliAccessRequiredPath, arHtml, "utf8");
  }
  const unmuteAccessRequiredPath = path.join(DIST, "unmute", "accesso-richiesto", "index.html");
  if (fs.existsSync(unmuteAccessRequiredPath)) {
    let arHtml = fs.readFileSync(unmuteAccessRequiredPath, "utf8");
    arHtml = applyPlaceholderMap(arHtml, map);
    warnLeftoverPlaceholders(arHtml, "unmute/accesso-richiesto/index.html");
    fs.writeFileSync(unmuteAccessRequiredPath, arHtml, "utf8");
  }
  const notificationsIndexPath = path.join(DIST, "notifications", "index.html");
  if (fs.existsSync(notificationsIndexPath)) {
    let nHtml = fs.readFileSync(notificationsIndexPath, "utf8");
    nHtml = applyPlaceholderMap(nHtml, map);
    warnLeftoverPlaceholders(nHtml, "notifications/index.html");
    fs.writeFileSync(notificationsIndexPath, nHtml, "utf8");
  }
  const userIndexPath = path.join(DIST, "user", "index.html");
  if (fs.existsSync(userIndexPath)) {
    let userHtml = fs.readFileSync(userIndexPath, "utf8");
    userHtml = applyPlaceholderMap(userHtml, map);
    warnLeftoverPlaceholders(userHtml, "user/index.html");
    fs.writeFileSync(userIndexPath, userHtml, "utf8");
  } else {
    console.warn("[build-site] Manca user/index.html (saltato placeholder).");
  }
  const ruoliIndexPath = path.join(DIST, "ruoli", "index.html");
  if (fs.existsSync(ruoliIndexPath)) {
    let ruoliHtml = fs.readFileSync(ruoliIndexPath, "utf8");
    ruoliHtml = applyPlaceholderMap(ruoliHtml, map);
    warnLeftoverPlaceholders(ruoliHtml, "ruoli/index.html");
    fs.writeFileSync(ruoliIndexPath, ruoliHtml, "utf8");
  } else {
    console.warn("[build-site] Manca ruoli/index.html (saltato placeholder).");
  }

  const regoleIndexPath = path.join(DIST, "regole", "index.html");
  if (fs.existsSync(regoleIndexPath)) {
    let regoleHtml = fs.readFileSync(regoleIndexPath, "utf8");
    regoleHtml = applyPlaceholderMap(regoleHtml, map);
    warnLeftoverPlaceholders(regoleHtml, "regole/index.html");
    fs.writeFileSync(regoleIndexPath, regoleHtml, "utf8");
  } else {
    console.warn("[build-site] Manca regole/index.html (saltato placeholder).");
  }

  const donazioniIndexPath = path.join(DIST, "donazioni", "index.html");
  if (fs.existsSync(donazioniIndexPath)) {
    let donazioniHtml = fs.readFileSync(donazioniIndexPath, "utf8");
    donazioniHtml = applyPlaceholderMap(donazioniHtml, map);
    warnLeftoverPlaceholders(donazioniHtml, "donazioni/index.html");
    fs.writeFileSync(donazioniIndexPath, donazioniHtml, "utf8");
  } else {
    console.warn("[build-site] Manca donazioni/index.html (saltato placeholder).");
  }

  const perksIndexPath = path.join(DIST, "perks", "index.html");
  if (fs.existsSync(perksIndexPath)) {
    let perksHtml = fs.readFileSync(perksIndexPath, "utf8");
    perksHtml = applyPlaceholderMap(perksHtml, map);
    warnLeftoverPlaceholders(perksHtml, "perks/index.html");
    fs.writeFileSync(perksIndexPath, perksHtml, "utf8");
  } else {
    console.warn("[build-site] Manca perks/index.html (saltato placeholder).");
  }

  const voteIndexPath = path.join(DIST, "vote", "index.html");
  if (fs.existsSync(voteIndexPath)) {
    let voteHtml = fs.readFileSync(voteIndexPath, "utf8");
    voteHtml = applyPlaceholderMap(voteHtml, map);
    warnLeftoverPlaceholders(voteHtml, "vote/index.html");
    fs.writeFileSync(voteIndexPath, voteHtml, "utf8");
  } else {
    console.warn("[build-site] Manca vote/index.html (saltato placeholder).");
  }

  const reviewsIndexPath = path.join(DIST, "recensioni", "index.html");
  if (fs.existsSync(reviewsIndexPath)) {
    let reviewsHtml = fs.readFileSync(reviewsIndexPath, "utf8");
    reviewsHtml = applyPlaceholderMap(reviewsHtml, map);
    warnLeftoverPlaceholders(reviewsHtml, "recensioni/index.html");
    fs.writeFileSync(reviewsIndexPath, reviewsHtml, "utf8");
  } else {
    console.warn("[build-site] Manca recensioni/index.html (saltato placeholder).");
  }

  const suggestionsIndexPath = path.join(DIST, "suggerimenti", "index.html");
  if (fs.existsSync(suggestionsIndexPath)) {
    let suggestionsHtml = fs.readFileSync(suggestionsIndexPath, "utf8");
    suggestionsHtml = applyPlaceholderMap(suggestionsHtml, map);
    warnLeftoverPlaceholders(suggestionsHtml, "suggerimenti/index.html");
    fs.writeFileSync(suggestionsIndexPath, suggestionsHtml, "utf8");
  } else {
    console.warn("[build-site] Manca suggerimenti/index.html (saltato placeholder).");
  }

  const ticketsIndexPath = path.join(DIST, "tickets", "index.html");
  if (fs.existsSync(ticketsIndexPath)) {
    let ticketsHtml = fs.readFileSync(ticketsIndexPath, "utf8");
    ticketsHtml = applyPlaceholderMap(ticketsHtml, map);
    warnLeftoverPlaceholders(ticketsHtml, "tickets/index.html");
    fs.writeFileSync(ticketsIndexPath, ticketsHtml, "utf8");
  } else {
    console.warn("[build-site] Manca tickets/index.html (saltato placeholder).");
  }

  const supportoIndexPath = path.join(DIST, "supporto", "index.html");
  if (fs.existsSync(supportoIndexPath)) {
    let supportoHtml = fs.readFileSync(supportoIndexPath, "utf8");
    supportoHtml = applyPlaceholderMap(supportoHtml, map);
    warnLeftoverPlaceholders(supportoHtml, "supporto/index.html");
    fs.writeFileSync(supportoIndexPath, supportoHtml, "utf8");
  } else {
    console.warn("[build-site] Manca supporto/index.html (saltato placeholder).");
  }

  const dashboardRel = [
    "dashboard/index.html",
    "dashboard/guild/index.html",
    "dashboard/feedback/index.html",
    "dashboard/faq/index.html",
    "dashboard/premium/index.html",
    "dashboard/premium/crediti/index.html",
    "dashboard/profilo/index.html",
    "dashboard/profilo/abbonamento/index.html",
    "dashboard/recensioni/index.html",
    "dashboard/transcript/index.html",
  ];
  for (const rel of dashboardRel) {
    const dashboardPath = path.join(DIST, ...rel.split("/"));
    if (!fs.existsSync(dashboardPath)) {
      console.warn("[build-site] Manca pagina dashboard:", rel);
      continue;
    }
    let dashboardHtml = fs.readFileSync(dashboardPath, "utf8");
    dashboardHtml = applyPlaceholderMap(dashboardHtml, map);
    warnLeftoverPlaceholders(dashboardHtml, rel);
    fs.writeFileSync(dashboardPath, dashboardHtml, "utf8");
  }

  const hogwartsHubIndexPath = path.join(DIST, "evento", "index.html");
  if (fs.existsSync(hogwartsHubIndexPath)) {
    let hogwartsHubHtml = fs.readFileSync(hogwartsHubIndexPath, "utf8");
    hogwartsHubHtml = applyPlaceholderMap(hogwartsHubHtml, {
      ...map,
      HOGWARTS_EVENT_HEADER: hogwartsEventHeaderFor("hub"),
    });
    warnLeftoverPlaceholders(hogwartsHubHtml, "evento/index.html");
    fs.writeFileSync(hogwartsHubIndexPath, hogwartsHubHtml, "utf8");
  } else {
    console.warn("[build-site] Manca evento/index.html (saltato placeholder).");
  }

  const hogwartsSortingIndexPath = path.join(DIST, "evento", "smistamento", "index.html");
  if (fs.existsSync(hogwartsSortingIndexPath)) {
    let hogwartsHtml = fs.readFileSync(hogwartsSortingIndexPath, "utf8");
    hogwartsHtml = applyPlaceholderMap(hogwartsHtml, {
      ...map,
      HOGWARTS_EVENT_HEADER: hogwartsEventHeaderFor("sorting"),
    });
    const hogwartsBgmJsonEscaped = hogwartsBgmJson.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    hogwartsHtml = hogwartsHtml.replace(
      /window\.__VC_HOGWARTS_BGM = JSON\.parse\('\{"baseVolume":0\.2\}'\);/,
      `window.__VC_HOGWARTS_BGM = JSON.parse('${hogwartsBgmJsonEscaped}');`,
    );
    warnLeftoverPlaceholders(hogwartsHtml, "evento/smistamento/index.html");
    fs.writeFileSync(hogwartsSortingIndexPath, hogwartsHtml, "utf8");
    const crestDir = path.join(DIST, "images", "evento-hogwarts", "crests");
    const crestNames = ["gryffindor.png", "ravenclaw.png", "hufflepuff.png", "slytherin.png"];
    const missingCrests = crestNames.filter((name) => !fs.existsSync(path.join(crestDir, name)));
    if (missingCrests.length) {
      console.warn(
        "[build-site] Stemmi Hogwarts mancanti in dist (" +
          missingCrests.join(", ") +
          "). Copia i PNG in WebSite/images/evento-hogwarts/crests/ e rifai il build.",
      );
    }
    const introMp4 = path.join(DIST, "images", "evento-hogwarts", "inizio.mp4");
    if (!fs.existsSync(introMp4)) {
      console.warn(
        "[build-site] Video intro Hogwarts mancante: WebSite/images/evento-hogwarts/inizio.mp4 (copiato in dist al build).",
      );
    }
  } else {
    console.warn("[build-site] Manca evento/smistamento/index.html (saltato placeholder).");
  }

  const hogwartsPointsIndexPath = path.join(DIST, "evento", "coppa", "index.html");
  if (fs.existsSync(hogwartsPointsIndexPath)) {
    let hogwartsPointsHtml = fs.readFileSync(hogwartsPointsIndexPath, "utf8");
    hogwartsPointsHtml = applyPlaceholderMap(hogwartsPointsHtml, {
      ...map,
      HOGWARTS_EVENT_HEADER: hogwartsEventHeaderFor("points"),
    });
    warnLeftoverPlaceholders(hogwartsPointsHtml, "evento/coppa/index.html");
    fs.writeFileSync(hogwartsPointsIndexPath, hogwartsPointsHtml, "utf8");
  } else {
    console.warn("[build-site] Manca evento/coppa/index.html (saltato placeholder).");
  }

  const hogwartsShopIndexPath = path.join(DIST, "evento", "shop", "index.html");
  if (fs.existsSync(hogwartsShopIndexPath)) {
    let hogwartsShopHtml = fs.readFileSync(hogwartsShopIndexPath, "utf8");
    hogwartsShopHtml = applyPlaceholderMap(hogwartsShopHtml, {
      ...map,
      HOGWARTS_EVENT_HEADER: hogwartsEventHeaderFor("shop"),
    });
    warnLeftoverPlaceholders(hogwartsShopHtml, "evento/shop/index.html");
    fs.writeFileSync(hogwartsShopIndexPath, hogwartsShopHtml, "utf8");
  } else {
    console.warn("[build-site] Manca evento/shop/index.html (saltato placeholder).");
  }

  const hogwartsPotionsIndexPath = path.join(DIST, "evento", "pozioni", "index.html");
  if (fs.existsSync(hogwartsPotionsIndexPath)) {
    let hogwartsPotionsHtml = fs.readFileSync(hogwartsPotionsIndexPath, "utf8");
    hogwartsPotionsHtml = applyPlaceholderMap(hogwartsPotionsHtml, {
      ...map,
      HOGWARTS_EVENT_HEADER: hogwartsEventHeaderFor("potions"),
    });
    warnLeftoverPlaceholders(hogwartsPotionsHtml, "evento/pozioni/index.html");
    fs.writeFileSync(hogwartsPotionsIndexPath, hogwartsPotionsHtml, "utf8");
  } else {
    console.warn("[build-site] Manca evento/pozioni/index.html (saltato placeholder).");
  }

  for (const statusRel of ["status/index.html", "stato/index.html"]) {
    const statusPath = path.join(DIST, statusRel);
    if (!fs.existsSync(statusPath)) continue;
    let statusHtml = fs.readFileSync(statusPath, "utf8");
    statusHtml = applyPlaceholderMap(statusHtml, map);
    warnLeftoverPlaceholders(statusHtml, statusRel);
    fs.writeFileSync(statusPath, statusHtml, "utf8");
  }

  const seratafilmIndexPath = path.join(DIST, "seratafilm", "index.html");
  if (fs.existsSync(seratafilmIndexPath)) {
    let seratafilmHtml = fs.readFileSync(seratafilmIndexPath, "utf8");
    seratafilmHtml = applyPlaceholderMap(seratafilmHtml, map);
    warnLeftoverPlaceholders(seratafilmHtml, "seratafilm/index.html");
    fs.writeFileSync(seratafilmIndexPath, seratafilmHtml, "utf8");
  } else {
    console.warn("[build-site] Manca seratafilm/index.html (saltato placeholder).");
  }
  const seratafilmGraziePath = path.join(DIST, "seratafilm", "grazie", "index.html");
  if (fs.existsSync(seratafilmGraziePath)) {
    let seratafilmGrazieHtml = fs.readFileSync(seratafilmGraziePath, "utf8");
    seratafilmGrazieHtml = applyPlaceholderMap(seratafilmGrazieHtml, map);
    warnLeftoverPlaceholders(seratafilmGrazieHtml, "seratafilm/grazie/index.html");
    fs.writeFileSync(seratafilmGraziePath, seratafilmGrazieHtml, "utf8");
  } else {
    console.warn("[build-site] Manca seratafilm/grazie/index.html (saltato placeholder).");
  }
  const seratafilmAccessoPath = path.join(DIST, "seratafilm", "accesso-richiesto", "index.html");
  if (fs.existsSync(seratafilmAccessoPath)) {
    let seratafilmAccessoHtml = fs.readFileSync(seratafilmAccessoPath, "utf8");
    seratafilmAccessoHtml = applyPlaceholderMap(seratafilmAccessoHtml, map);
    warnLeftoverPlaceholders(seratafilmAccessoHtml, "seratafilm/accesso-richiesto/index.html");
    fs.writeFileSync(seratafilmAccessoPath, seratafilmAccessoHtml, "utf8");
  }

  const staffPageRels = [
    "staff/index.html",
    "staff/pause/index.html",
    "staff/punti-tolti/index.html",
    "staff/accesso-richiesto/index.html",
    "staff/ticket/index.html",
    "staff/guida/index.html",
    "staff/gestione/index.html",
    "staff/organico/index.html",
    "staff/inbox/index.html",
  ];
  for (const rel of staffPageRels) {
    const staffPath = path.join(DIST, rel);
    if (!fs.existsSync(staffPath)) {
      console.warn("[build-site] Manca pagina staff:", rel);
      continue;
    }
    let staffHtml = fs.readFileSync(staffPath, "utf8");
    staffHtml = applyPlaceholderMap(staffHtml, map);
    warnLeftoverPlaceholders(staffHtml, rel);
    fs.writeFileSync(staffPath, staffHtml, "utf8");
  }

  const faqIndexPath = path.join(DIST, "faq", "index.html");
  if (fs.existsSync(faqIndexPath)) {
    let faqHtml = fs.readFileSync(faqIndexPath, "utf8");
    faqHtml = applyPlaceholderMap(faqHtml, map);
    warnLeftoverPlaceholders(faqHtml, "faq/index.html");
    fs.writeFileSync(faqIndexPath, faqHtml, "utf8");
  } else {
    console.warn("[build-site] Manca faq/index.html (saltato placeholder).");
  }

  const sponsorIndexPath = path.join(DIST, "sponsor", "index.html");
  if (fs.existsSync(sponsorIndexPath)) {
    let sponsorHtml = fs.readFileSync(sponsorIndexPath, "utf8");
    sponsorHtml = applyPlaceholderMap(sponsorHtml, map);
    warnLeftoverPlaceholders(sponsorHtml, "sponsor/index.html");
    fs.writeFileSync(sponsorIndexPath, sponsorHtml, "utf8");
  } else {
    console.warn("[build-site] Manca sponsor/index.html (saltato placeholder).");
  }

  const rankCustomizeRel = ["user/personalizza/index.html", "user/customize/index.html", "user/custom/index.html"];
  for (const rel of rankCustomizeRel) {
    const customizePath = path.join(DIST, rel);
    if (!fs.existsSync(customizePath)) {
      console.warn("[build-site] Manca pagina personalizzazione:", rel);
      continue;
    }
    let customizeHtml = fs.readFileSync(customizePath, "utf8");
    customizeHtml = applyPlaceholderMap(customizeHtml, map);
    warnLeftoverPlaceholders(customizeHtml, rel);
    fs.writeFileSync(customizePath, customizeHtml, "utf8");
  }

  const legalRel = [
    "terms/index.html",
    "privacy/index.html",
    "cookie/index.html",
    "dati/index.html",
    "copyright/index.html",
  ];
  for (const rel of legalRel) {
    const legalPath = path.join(DIST, rel);
    if (!fs.existsSync(legalPath)) {
      console.warn("[build-site] Manca pagina legale:", rel);
      continue;
    }
    let legalHtml = fs.readFileSync(legalPath, "utf8");
    legalHtml = applyPlaceholderMap(legalHtml, map);
    warnLeftoverPlaceholders(legalHtml, rel);
    fs.writeFileSync(legalPath, legalHtml, "utf8");
  }

  applyAvatarFallbackToDist(DIST, buildAssetVersion);
  applyEmojiRenderToDist(DIST, buildAssetVersion);
  applyVcDialogToDist(DIST, buildAssetVersion);
  applyCursorTrailToDist(DIST, buildAssetVersion);
  applyTypeSfxToDist(DIST, buildAssetVersion);
  applyPtrToDist(DIST, buildAssetVersion);
  applyMobileNavToDist(DIST, buildAssetVersion);
  applyHeaderNameMarqueeToDist(DIST, buildAssetVersion);
  applyI18nToDist(DIST, buildAssetVersion);
  applyLiveStatsBootToDist(DIST, cfg, inviteCode);
  applySiteSponsorAdToDist(DIST, cfg);
  applyKickLivePipToDist(DIST, cfg);
  applyMaintenanceGateToDist(DIST, maintenanceBoot);
  applySiteRouteGuardToDist(DIST, cfg);
  applyHeaderPromoToDist(DIST, headerPromoButtonHtml, headerPromoClientConfig);

  const siteBuild = cfg.siteBuild && typeof cfg.siteBuild === "object" ? cfg.siteBuild : null;
  const skipClientObfuscation = siteBuild?.obfuscateClientAssets === false;
  if (!skipClientObfuscation) {
    await obfuscateProjectJsInDist(DIST);
    await minifyHtmlFilesInDist(DIST);
  } else {
    console.log("[build-site] Offuscamento/minify client disattivato (siteBuild.obfuscateClientAssets: false).");
  }

  assertDistHasNoTemplatePlaceholders(DIST);

  writeRobotsAndSitemap(DIST, cfg);

  console.log("Build OK:", path.relative(process.cwd(), DIST));
}

const runExtraOnly = process.argv.includes("--only-live-stats-extra");
(runExtraOnly ? mainLiveStatsExtraOnly() : main()).catch((e) => {
  console.error(e);
  process.exit(1);
});