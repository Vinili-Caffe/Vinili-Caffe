import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = process.env.VC_AUDIT_BASE || "http://127.0.0.1:8765";
const OUT = process.env.VC_AUDIT_OUT || "/tmp/vc-site-audit/out2";
mkdirSync(OUT, { recursive: true });

const pages = [
  "/",
  "/wiki/",
  "/stato/",
  "/status/",
  "/dashboard/",
  "/dashboard/guild/",
  "/evento/",
  "/evento/pozioni/",
  "/seratafilm/",
  "/faq/",
  "/vote/",
  "/candidature/",
];

const browser = await chromium.launch({ headless: true });
const issues = [];
for (const path of pages) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const cons = [];
  page.on("console", (m) => {
    if (m.type() === "error") cons.push(`${m.text()} @ ${m.location()?.url || ""}`);
  });
  page.on("pageerror", (e) => cons.push(`PAGE ${e.message || e}`));
  const failed = [];
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (/chrome-extension|cloudflare|turnstile/i.test(u)) return;
    failed.push(`${r.failure()?.errorText || "fail"} ${u}`);
  });
  page.on("response", (res) => {
    if (res.status() < 400 || res.status() === 401 || res.status() === 403) return;
    const u = res.url();
    if (/cloudflare|turnstile/i.test(u)) return;
    failed.push(`HTTP ${res.status()} ${u}`);
  });
  await page.goto(new URL(path, BASE).toString(), { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
  const row = { path, cons, failed: [...new Set(failed)] };
  issues.push(row);
  console.log(path, "console", cons.length, "net", row.failed.length);
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/recheck.json`, JSON.stringify(issues, null, 2));
console.log(JSON.stringify(issues, null, 2));
