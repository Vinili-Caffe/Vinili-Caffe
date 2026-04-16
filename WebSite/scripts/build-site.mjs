import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const CONFIG_PATH = path.join(ROOT, "site.config.json");

const EXCLUDE = new Set([
  "dist",
  "scripts",
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
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyRecursive(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    if (EXCLUDE.has(name)) continue;
    const src = path.join(srcDir, name);
    const dst = path.join(dstDir, name);
    const st = fs.statSync(src);
    if (st.isDirectory()) copyRecursive(src, dst);
    else fs.copyFileSync(src, dst);
  }
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

function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error("Manca site.config.json in", ROOT);
    process.exit(1);
  }
  const cfg = readJson(CONFIG_PATH);
  rmrf(DIST);
  copyRecursive(ROOT, DIST);

  const indexPath = path.join(DIST, "index.html");
  let html = fs.readFileSync(indexPath, "utf8");

  const cookieYesClientId = String(cfg.cookieYesClientId || "").trim();
  const cookieYesSafe = /^[a-zA-Z0-9_-]+$/.test(cookieYesClientId) ? cookieYesClientId : "";
  const cookieYesBlock = cookieYesSafe
    ? `    <script id="cookieyes" type="text/javascript" src="https://cdn-cookieyes.com/client_data/${cookieYesSafe}/script.js"></script>\n`
    : "";

  const gaId = String(cfg.googleAnalyticsMeasurementId || "").trim();
  const gaBlock = gaId
    ? `    <script async src="https://www.googletagmanager.com/gtag/js?id=${escAttr(gaId)}"></script>\n    <script>\n      window.dataLayer = window.dataLayer || [];\n      function gtag(){dataLayer.push(arguments);}\n      gtag("js", new Date());\n      gtag("config", "${escAttr(gaId)}");\n    </script>\n`
    : "";

  const instagramUrl = String(cfg.instagramUrl || "").trim();
  const instagramLi = instagramUrl
    ? `        <li>\n          <a href="${escAttr(instagramUrl)}" target="_blank" rel="noopener noreferrer"\n            ><i class="fa fa-instagram"></i\n          ></a>\n        </li>\n`
    : "";

  const year = String(new Date().getFullYear());

  const map = {
    COOKIEYES_BLOCK: cookieYesBlock,
    GA_BLOCK: gaBlock,
    SITE_NAME: cfg.siteName || "Vinili & Caffè",
    SITE_URL: cfg.siteUrl || "",
    DISCORD_INVITE_URL: cfg.discordInviteUrl || "https://discord.gg/viniliecaffe",
    META_DESCRIPTION: cfg.metaDescription || "",
    META_KEYWORDS: cfg.metaKeywords || "",
    SUPPORT_EMAIL: cfg.supportEmail || "",
    SITE_MODERATOR_EMAIL: cfg.siteModeratorEmail || cfg.supportEmail || "",
    SITE_ADMIN_EMAIL: cfg.siteAdminEmail || cfg.supportEmail || "",
    FOUNDED_DISPLAY: cfg.foundedDisplay || "—",
    STAT_MEMBERS: String(cfg.statMembers ?? "0"),
    STAT_BOOSTS: String(cfg.statBoosts ?? "0"),
    STAT_STAFF: String(cfg.statStaff ?? "0"),
    YEAR: year,
    INSTAGRAM_LI_INTRO: instagramLi,
    INSTAGRAM_LI_FOOTER: instagramLi,
  };

  for (const [key, value] of Object.entries(map)) {
    const token = `{{${key}}}`;
    if (!html.includes(token)) {
      continue;
    }
    html = html.split(token).join(String(value ?? ""));
  }

  const leftover = [...html.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((m) => m[1]);
  if (leftover.length) {
    console.warn("Placeholder non sostituiti:", [...new Set(leftover)].join(", "));
  }

  fs.writeFileSync(indexPath, html, "utf8");
  console.log("Build OK:", path.relative(process.cwd(), DIST));
}

main();
