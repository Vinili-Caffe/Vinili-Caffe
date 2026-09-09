#!/usr/bin/env node
/**
 * Restore homepage premium footer on all public pages (exclude dashboard/staff/status/seratafilm).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.VC_SITE_ROOT
  ? path.resolve(process.env.VC_SITE_ROOT)
  : path.resolve(__dirname, "..");

const PREMIUM_FOOTER = `  <footer class="vc-premium-footer" aria-label="Footer" data-i18n-attr="aria-label:footer.aria">
    <div class="vc-premium-footer__card">
      <div class="vc-premium-footer__outer">
        <div class="vc-premium-footer__inner">
          <div class="vc-premium-footer__grid">
            <section class="vc-premium-footer__brand" aria-label="Vinili & Caffè">
              <a class="vc-premium-footer__logo-row" href="https://www.viniliecaffe.it/">
                <span class="vc-premium-footer__logo" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 20C4 20 4 14 10 10C16 6 20 4 20 4C20 4 18 8 14 14C10 20 4 20 4 20Z" fill="white" />
                    <path d="M4 20L10 14" stroke="white" stroke-width="2" stroke-linecap="round" />
                  </svg>
                </span>
                <span class="vc-premium-footer__wordmark">Vinili & Caffè</span>
              </a>
              <p class="vc-premium-footer__desc" data-i18n="footer.desc">Community italiana Discord curata nei dettagli: musica, socialità, ruoli personalizzati, eventi e strumenti sviluppati su misura.</p>
              <div class="vc-premium-footer__socials" aria-label="Social" data-i18n-attr="aria-label:footer.social">
                <a class="vc-premium-footer__social" href="https://www.instagram.com/viniliecaffe/" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16.8" cy="7.2" r="1.1" fill="currentColor"/></svg>
                </a>
                <a class="vc-premium-footer__social" href="https://discord.gg/viniliecaffe" target="_blank" rel="noopener noreferrer" aria-label="Discord">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 5.4A17 17 0 0 0 15.2 4l-.2.4a13 13 0 0 1 3.2 1.6 10.8 10.8 0 0 0-4-1.2 11.2 11.2 0 0 0-4.4.2A10.8 10.8 0 0 0 5.8 6a13 13 0 0 1 3.3-1.6L8.9 4a17 17 0 0 0-4.4 1.4C1.8 9.4 1 13.3 1.4 17.2A17 17 0 0 0 6.6 20l1.1-1.5c-.6-.2-1.2-.5-1.8-.9l.4-.3c3.4 1.6 7.2 1.6 10.6 0l.4.3c-.6.4-1.2.7-1.8.9l1.1 1.5a17 17 0 0 0 5.2-2.8c.5-4.5-.8-8.4-2.3-11.8ZM8.8 15.1c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.4 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" fill="currentColor"/></svg>
                </a>
                <a class="vc-premium-footer__social" href="https://www.tiktok.com/@viniliecaffe" target="_blank" rel="noopener noreferrer" aria-label="TikTok">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4v9.1a4.4 4.4 0 1 1-4.4-4.4c.35 0 .7.04 1.03.12v2.55a1.9 1.9 0 1 0 1.03 1.68V4h2.34Zm0 0c.4 2.15 1.74 3.43 3.7 3.84v2.42c-1.52-.08-2.8-.56-3.7-1.36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </a>
              </div>
            </section>
            <div class="vc-premium-footer__navcols">
            <nav class="vc-premium-footer__col" aria-label="Community" data-i18n-attr="aria-label:footer.community">
              <h4 data-i18n="footer.community">Community</h4>
              <ul>
                <li><a href="https://www.viniliecaffe.it/" data-i18n="footer.home">Home</a></li>
                <li><a href="https://www.viniliecaffe.it/user" data-i18n="footer.users">Users</a></li>
                <li><a href="https://www.viniliecaffe.it/ruoli" data-i18n="footer.roles">Ruoli</a></li>
              </ul>
            </nav>
            <nav class="vc-premium-footer__col" aria-label="Scopri" data-i18n-attr="aria-label:footer.discover">
              <h4 data-i18n="footer.discover">Scopri</h4>
              <ul>
                <li><a href="/wiki" data-i18n="footer.wiki">Wiki</a></li>
                <li><a href="https://www.viniliecaffe.it/regole" data-i18n="footer.rules">Regole</a></li>
                <li><a href="/faq" data-i18n="footer.faq">FAQ</a></li>
                <li><a href="/sponsor" data-i18n="footer.sponsor">Sponsor</a></li>
              </ul>
            </nav>
            <nav class="vc-premium-footer__col" aria-label="Supporta" data-i18n-attr="aria-label:footer.support">
              <h4 data-i18n="footer.support">Supporta</h4>
              <ul>
                <li><a href="https://www.viniliecaffe.it/perks" data-i18n="footer.perks">Perks</a></li>
                <li><a href="https://www.viniliecaffe.it/vote" data-i18n="footer.vote">Vota</a></li>
                <li><a href="https://www.viniliecaffe.it/recensioni" data-i18n="footer.reviews">Recensioni</a></li>
                <li><a href="https://www.viniliecaffe.it/donazioni" data-i18n="footer.donations">Donazioni</a></li>
              </ul>
            </nav>
            <nav class="vc-premium-footer__col" aria-label="Richieste" data-i18n-attr="aria-label:footer.requests">
              <h4 data-i18n="footer.requests">Richieste</h4>
              <ul>
                <li><a href="https://www.viniliecaffe.it/appelli" data-i18n="footer.appeals">Appelli</a></li>
                <li><a href="https://www.viniliecaffe.it/candidature" data-i18n="footer.applications">Candidature</a></li>
                <li><a href="https://www.viniliecaffe.it/feedback" data-i18n="footer.suggestions">Feedback</a></li>
                <li><a href="https://www.viniliecaffe.it/tickets" data-i18n="footer.tickets">Tickets</a></li>
              </ul>
            </nav>
            </div>
          </div>
        </div>
        <div class="vc-premium-footer__legal">
          <p><a class="vc-footer-copy-link" href="https://www.viniliecaffe.it/copyright">© 2026 Vinili & Caffè. All rights reserved.</a></p>
          <nav aria-label="Link legali" data-i18n-attr="aria-label:footer.legalLinks">
            <a href="https://www.viniliecaffe.it/terms" data-i18n="footer.terms">Termini di Servizio</a>
            <span aria-hidden="true"></span>
            <a href="https://www.viniliecaffe.it/privacy" data-i18n="footer.privacy">Privacy Policy</a>
            <span aria-hidden="true"></span>
            <a href="https://www.viniliecaffe.it/cookie" data-i18n="footer.cookies">Cookie Policy</a>
          </nav>
        </div>
      </div>
    </div>
  </footer>`;

const SIMPLE_RE =
  /<footer\b[^>]*>[\s\S]*?(?:vc-footer-brand-row|Sito realizzato da)[\s\S]*?<\/footer>/gi;
const PREMIUM_RE = /<footer\b[^>]*\bvc-premium-footer\b[^>]*>[\s\S]*?<\/footer>/gi;

const SKIP_PARTS = new Set([
  "dashboard",
  "staff",
  "status",
  "seratafilm",
  "dist",
  "node_modules",
]);

function shouldSkip(rel) {
  const parts = rel.split(/[/\\]/).map((p) => p.toLowerCase());
  return parts.some((p) => SKIP_PARTS.has(p));
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_PARTS.has(ent.name.toLowerCase())) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && ent.name.endsWith(".html")) out.push(p);
  }
  return out;
}

const changed = [];
for (const file of walk(root)) {
  const rel = path.relative(root, file);
  if (shouldSkip(rel)) continue;
  let text = fs.readFileSync(file, "utf8");
  if (!/<footer\b/i.test(text)) continue;

  let next = text;
  if (/\bvc-premium-footer\b/.test(next) && !/\bvc-premium-footer--dashboard\b/.test(next)) {
    // Already premium (non-dashboard): normalize to homepage premium markup.
    next = next.replace(PREMIUM_RE, PREMIUM_FOOTER);
  } else if (/\bvc-footer-brand-row\b|Sito realizzato da/.test(next) && !/\bdashboard\b/i.test(rel)) {
    next = next.replace(SIMPLE_RE, PREMIUM_FOOTER);
  } else {
    continue;
  }

  if (next === text) continue;
  fs.writeFileSync(file, next, "utf8");
  changed.push(rel.replace(/\\/g, "/"));
}

console.log(`patched=${changed.length} root=${root}`);
for (const rel of changed) console.log("  +", rel);
