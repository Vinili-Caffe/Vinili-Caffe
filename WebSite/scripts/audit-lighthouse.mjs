import lighthouse from "lighthouse";
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const BASE = process.env.VC_AUDIT_BASE || "http://127.0.0.1:8765";
const OUT = process.env.VC_AUDIT_OUT || "/tmp/vc-site-audit/out";
mkdirSync(OUT, { recursive: true });

const PAGES = ["/", "/wiki/", "/faq/", "/dashboard/", "/status/", "/seratafilm/", "/vote/", "/evento/"];

async function ensureLighthouse() {
  try {
    return (await import("lighthouse")).default;
  } catch {
    console.log("installing lighthouse...");
    const r = spawnSync("npm", ["install", "lighthouse@12.8.2", "--silent"], {
      cwd: "/tmp/vc-site-audit",
      stdio: "inherit",
    });
    if (r.status !== 0) process.exit(r.status || 1);
    return (await import("lighthouse")).default;
  }
}

const lh = await ensureLighthouse();
const browser = await chromium.launch({
  headless: true,
  args: ["--remote-debugging-port=9222", "--no-sandbox", "--disable-dev-shm-usage"],
});

const summary = [];
for (const path of PAGES) {
  const url = new URL(path, BASE).toString();
  console.log("lighthouse", path);
  const result = await lh(url, {
    port: 9222,
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    formFactor: "mobile",
    screenEmulation: {
      mobile: true,
      width: 412,
      height: 915,
      deviceScaleFactor: 2.625,
      disabled: false,
    },
  });
  const cats = result.lhr.categories;
  const scores = {
    performance: Math.round((cats.performance?.score || 0) * 100),
    accessibility: Math.round((cats.accessibility?.score || 0) * 100),
    bestPractices: Math.round((cats["best-practices"]?.score || 0) * 100),
    seo: Math.round((cats.seo?.score || 0) * 100),
  };
  const failedAudits = Object.values(result.lhr.audits)
    .filter((a) => a && typeof a.score === "number" && a.score < 0.5)
    .slice(0, 10)
    .map((a) => ({ id: a.id, title: a.title, score: a.score, display: a.displayValue || "" }));
  summary.push({ path, scores, failedAudits });
  console.log(path, scores);
}

await browser.close();
writeFileSync(`${OUT}/lighthouse-summary.json`, JSON.stringify({ at: new Date().toISOString(), base: BASE, summary }, null, 2));
console.log("wrote", `${OUT}/lighthouse-summary.json`);
