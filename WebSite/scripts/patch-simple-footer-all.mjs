import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.VC_SITE_ROOT
  ? path.resolve(process.env.VC_SITE_ROOT)
  : path.resolve(__dirname, "..");

const SIMPLE_FOOTER = `
  <footer class="relative z-10 border-t border-white/8 bg-slate-950/20">
    <div class="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 py-10 text-center">
      <div class="vc-footer-brand-row flex flex-wrap items-center justify-center gap-3 sm:gap-5"
        aria-label="Social e home">
        {{FOOTER_SOCIAL_LEFT}}
        <a class="inline-flex items-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-lg font-extrabold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          href="{{SITE_URL}}">{{SITE_NAME}}</a>
        {{FOOTER_SOCIAL_RIGHT}}
      </div>
      <nav class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-300/80"
        aria-label="Link legali">
        <a class="transition hover:text-white" href="{{TERMS_URL}}">Termini di Servizio</a>
        <a class="transition hover:text-white" href="{{PRIVACY_URL}}">Privacy Policy</a>
        <a class="transition hover:text-white" href="{{COOKIE_POLICY_URL}}">Cookie Policy</a>
      </nav>
      <p class="max-w-xl text-sm leading-relaxed text-slate-400">
        © {{YEAR}} {{SITE_NAME}}. Sito realizzato da {{SITE_NAME}} con
        <span class="vc-footer-heart" role="img" aria-label="amore">❤️</span> per la community.
      </p>
    </div>
  </footer>`;

const PREMIUM_RE = /<footer\b[^>]*\bvc-premium-footer\b[^>]*>[\s\S]*?<\/footer>/gi;

function walk(dir, out = []) {
  const skipDistSubtree = path.basename(root) !== "dist";
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules") continue;
    if (skipDistSubtree && ent.name === "dist") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && ent.name.endsWith(".html")) out.push(p);
  }
  return out;
}

const changed = [];
for (const file of walk(root)) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes("vc-premium-footer")) continue;
  const newText = text.replace(PREMIUM_RE, SIMPLE_FOOTER);
  if (newText === text) continue;
  fs.writeFileSync(file, newText, "utf8");
  changed.push(path.relative(root, file));
}

console.log(`patched=${changed.length} root=${root}`);
for (const rel of changed) console.log("  +", rel);
