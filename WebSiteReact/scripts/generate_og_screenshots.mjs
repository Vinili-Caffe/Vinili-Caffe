/**
 * Screenshot reali 1200×630 per OG / Component Embeds.
 * Uso (VPS, con Chrome + playwright-core):
 *   node generate_og_screenshots.mjs \
 *     --index /path/to/og/index.json \
 *     --out /tmp/vc_og_shots \
 *     --base https://www.viniliecaffe.it
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const W = 1200;
const H = 630;
const DEFAULT_INDEX = join(__dirname, "../public/og/index.json");

function arg(name, fallback = "") {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const INDEX = arg("index", DEFAULT_INDEX);
const OUT = arg("out", "/tmp/vc_og_shots");
const BASE = String(arg("base", "https://www.viniliecaffe.it")).replace(/\/$/, "");
const LIMIT = Number(arg("limit", "0")) || 0;
const ONLY = arg("only", "");

const HIDE_CSS = `
  [data-boot-gate], .boot-gate, #boot-gate, .vc-boot-gate,
  [data-cookie], .cookie-banner, #cookie-banner, .vc-cookie,
  [class*="cookie"], [id*="cookie"], [class*="Cookie"],
  [class*="consent"], [id*="consent"],
  dialog[open], .modal-backdrop, .vc-modal,
  .halloween-decor, [data-halloween], .sponsor-ad, .vc-sponsor-ad,
  .live-corner, [data-live-corner], .notif-toast, .sw-update-toast,
  #vc-cookie, #vcCookie, .vc-cookie-bar, .vc-cookie-modal {
    display: none !important; visibility: hidden !important; opacity: 0 !important;
    pointer-events: none !important;
  }
  html, body { overflow: hidden !important; }
`;

function loadPlaywright() {
  const pkg = require.resolve("playwright-core", {
    paths: ["/tmp/vc_og_pw", process.cwd(), __dirname, join(__dirname, "../node_modules")],
  });
  return require(pkg);
}

function pageUrl(path) {
  if (path === "/404/" || path === "/404") return `${BASE}/this-page-does-not-exist-og-404/`;
  return `${BASE}${path === "/" ? "/" : path}`;
}

const rows = JSON.parse(await readFile(INDEX, "utf8"));
if (!Array.isArray(rows) || !rows.length) {
  console.error("index.json vuoto o invalido:", INDEX);
  process.exit(1);
}

let list = rows.filter((r) => r?.slug && r?.file);
if (ONLY) list = list.filter((r) => r.slug === ONLY || r.path === ONLY);
if (LIMIT > 0) list = list.slice(0, LIMIT);

await mkdir(OUT, { recursive: true });

const { chromium } = loadPlaywright();
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars", "--font-render-hinting=none"],
});

const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 VC-OG-Shot/1",
  locale: "it-IT",
  colorScheme: "dark",
});
await context.addCookies([
  {
    name: "vc_cookie_consent",
    value: "rejected",
    domain: ".viniliecaffe.it",
    path: "/",
  },
  {
    name: "vc_cookie_banner_ack_v3",
    value: "rejected",
    domain: ".viniliecaffe.it",
    path: "/",
  },
]);
await context.addInitScript(() => {
  try {
    localStorage.setItem("vc-theme", "dark");
    localStorage.setItem("vc_cookie_consent", "rejected");
    localStorage.setItem("vc_cookie_banner_ack_v3", "rejected");
  } catch {}
});

const page = await context.newPage();
let ok = 0;
let fail = 0;

for (const row of list) {
  const url = pageUrl(row.path || "/");
  const dest = join(OUT, row.file);
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch(() =>
      page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }),
    );
    await page.addStyleTag({ content: HIDE_CSS }).catch(() => {});
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      document.body?.classList?.add("dark");
      try {
        localStorage.setItem("vc-theme", "dark");
        localStorage.setItem("cookie-consent", "necessary");
        localStorage.setItem("vc-cookie-consent", "essential");
        localStorage.setItem("vc_cookie_ok", "1");
        document.cookie = "vc_cookie=essential;path=/;max-age=31536000";
      } catch {}
      const clickTexts = ["Solo essenziali", "Accetta", "Accept", "Essenziali"];
      for (const btn of document.querySelectorAll("button, a, [role='button']")) {
        const t = String(btn.textContent || "").trim();
        if (clickTexts.some((x) => t === x || t.includes(x))) {
          try {
            btn.click();
          } catch {}
        }
      }
      for (const sel of [
        "[data-boot-gate]",
        ".boot-gate",
        "#boot-gate",
        ".cookie-banner",
        "#cookie-banner",
        "[class*='cookie']",
        "[id*='cookie']",
        "[class*='consent']",
      ]) {
        document.querySelectorAll(sel).forEach((el) => {
          try {
            el.remove();
          } catch {}
        });
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(500);
    await page.addStyleTag({ content: HIDE_CSS }).catch(() => {});
    await page.waitForTimeout(200);
    await page.setViewportSize({ width: W, height: H });
    await page.screenshot({
      path: dest,
      type: "png",
      clip: { x: 0, y: 0, width: W, height: H },
      animations: "disabled",
    });
    ok++;
    console.log(`OK  ${row.slug} ← ${url}`);
  } catch (err) {
    fail++;
    console.error(`FAIL ${row.slug}: ${err?.message || err}`);
  }
}

await browser.close();

const manifest = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  size: `${W}x${H}`,
  ok,
  fail,
  versionHint: "20261025ogShot1",
  files: list.map((r) => r.file),
};
await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`done: ${ok} ok, ${fail} fail → ${OUT}`);
if (fail && !ok) process.exit(1);
