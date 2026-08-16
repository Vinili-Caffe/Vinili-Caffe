import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.VC_AUDIT_BASE || "https://www.viniliecaffe.it";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.VC_AUDIT_OUT || join(__dirname, "..", ".audit");

const PAGES = [
  "/",
  "/wiki/",
  "/faq/",
  "/regole/",
  "/privacy/",
  "/terms/",
  "/cookie/",
  "/sponsor/",
  "/donazioni/",
  "/vote/",
  "/recensioni/",
  "/suggerimenti/",
  "/ruoli/",
  "/perks/",
  "/notifications/",
  "/stato/",
  "/status/",
  "/candidature/",
  "/candidature/accesso-richiesto/",
  "/appelli/",
  "/appelli/accesso-richiesto/",
  "/unban/",
  "/unban/accesso-richiesto/",
  "/unmute/",
  "/unmute/accesso-richiesto/",
  "/seratafilm/",
  "/seratafilm/accesso-richiesto/",
  "/seratafilm/grazie/",
  "/evento/",
  "/evento/coppa/",
  "/evento/pozioni/",
  "/evento/shop/",
  "/evento/smistamento/",
  "/dashboard/",
  "/dashboard/faq/",
  "/dashboard/feedback/",
  "/dashboard/premium/",
  "/dashboard/premium/crediti/",
  "/dashboard/profilo/",
  "/dati/",
  "/dashboard/recensioni/",
  "/dashboard/guild/",
  "/user/",
  "/user/personalizza/",
  "/user/customize/",
];

const IGNORE_CONSOLE = [
  /Download the React DevTools/i,
  /\[HMR\]/i,
  /favicon\.ico/i,
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /listener indicated an asynchronous response/i,
  /message channel closed before a response was received/i,
  /Extension context invalidated/i,
  /Requires ['"]?TrustedScript/i,
  /CookieCrumbler/i,
  /net::ERR_ABORTED/i,
];

const IGNORE_REQUEST = [
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /googletagmanager\.com/i,
  /google-analytics\.com/i,
  /doubleclick\.net/i,
  /pagead2\.googlesyndication\.com/i,
];

function shouldIgnoreText(text, patterns) {
  return patterns.some((re) => re.test(String(text || "")));
}

async function auditPage(browser, path) {
  const url = new URL(path, BASE).toString();
  const extraHTTPHeaders = {};
  if (process.env.VC_AUDIT_HOST) {
    extraHTTPHeaders.Host = process.env.VC_AUDIT_HOST;
  }
  const context = await browser.newContext({
    viewport: { width: 1365, height: 900 },
    ignoreHTTPSErrors: true,
    extraHTTPHeaders,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  const consoleMsgs = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on("console", (msg) => {
    const type = msg.type();
    if (type !== "error" && type !== "warning") return;
    const text = msg.text();
    if (shouldIgnoreText(text, IGNORE_CONSOLE)) return;
    consoleMsgs.push({ type, text, loc: msg.location()?.url || "" });
  });
  page.on("pageerror", (err) => {
    const text = err?.message || String(err);
    if (shouldIgnoreText(text, IGNORE_CONSOLE)) return;
    pageErrors.push(text);
  });
  page.on("requestfailed", (req) => {
    const u = req.url();
    if (shouldIgnoreText(u, IGNORE_REQUEST)) return;
    const failure = req.failure()?.errorText || "failed";
    if (/ERR_ABORTED|NS_BINDING_ABORTED/i.test(failure)) return;
    failedRequests.push({ url: u, failure, status: req.response()?.status?.() });
  });
  page.on("response", (res) => {
    const status = res.status();
    if (status < 400) return;
    const u = res.url();
    if (shouldIgnoreText(u, IGNORE_REQUEST)) return;
    // Expected auth redirects / gated APIs
    if (status === 401 || status === 403) return;
    if (status === 404 && /\/webhooks\//i.test(u)) return;
    failedRequests.push({ url: u, failure: `HTTP ${status}`, status });
  });

  let navError = null;
  let finalUrl = url;
  let status = null;
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    status = res?.status() ?? null;
    finalUrl = page.url();
    await page.waitForTimeout(2500);
  } catch (e) {
    navError = e?.message || String(e);
  }

  const result = {
    path,
    url,
    finalUrl,
    status,
    navError,
    console: consoleMsgs,
    pageErrors,
    failedRequests: dedupeFailed(failedRequests),
  };
  await context.close();
  return result;
}

function dedupeFailed(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = `${it.status || ""}|${it.failure}|${it.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function summarize(results) {
  const issues = [];
  for (const r of results) {
    if (r.navError) issues.push({ path: r.path, kind: "nav", detail: r.navError });
    if (r.status && r.status >= 400) issues.push({ path: r.path, kind: "status", detail: String(r.status) });
    for (const e of r.pageErrors) issues.push({ path: r.path, kind: "pageerror", detail: e });
    for (const c of r.console.filter((x) => x.type === "error")) {
      issues.push({ path: r.path, kind: "console", detail: c.text });
    }
    for (const f of r.failedRequests) {
      // Soft: CDN/third-party noise less critical
      if (/fonts\.gstatic|fonts\.googleapis|cdn\.jsdelivr|unpkg\.com/i.test(f.url)) continue;
      issues.push({ path: r.path, kind: "network", detail: `${f.failure} ${f.url}` });
    }
  }
  return issues;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const path of PAGES) {
    process.stdout.write(`audit ${path} ... `);
    const r = await auditPage(browser, path);
    results.push(r);
    const n =
      r.pageErrors.length +
      r.console.filter((c) => c.type === "error").length +
      r.failedRequests.length +
      (r.navError ? 1 : 0);
    console.log(n ? `${n} issues (HTTP ${r.status})` : `ok (HTTP ${r.status})`);
  }
  await browser.close();

  const issues = summarize(results);
  const report = { base: BASE, at: new Date().toISOString(), pages: results.length, issueCount: issues.length, issues, results };
  const outPath = join(OUT_DIR, "console-audit.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
  console.log(`Issues: ${issues.length}`);
  for (const iss of issues.slice(0, 80)) {
    console.log(`- [${iss.kind}] ${iss.path}: ${iss.detail.slice(0, 220)}`);
  }
  if (issues.length > 80) console.log(`... +${issues.length - 80} more`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
