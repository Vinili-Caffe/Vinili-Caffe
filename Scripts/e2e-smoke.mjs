#!/usr/bin/env node
/**
 * Smoke HTTP su rotte chiave del sito (nessuna dipendenza npm).
 *   node scripts/e2e-smoke.mjs
 *   BASE_URL=https://beta.viniliecaffe.it node scripts/e2e-smoke.mjs
 */
const BASE = (process.env.BASE_URL || "https://www.viniliecaffe.it").replace(/\/$/, "");
const ROUTES = ["/", "/vote/", "/tickets/", "/faq/", "/wordle/", "/notifications/", "/bacheca/"];
const PLACEHOLDER = /\{\{[A-Z0-9_]+\}\}/;

function pathUrl(route) {
  if (route === "/") return `${BASE}/`;
  const p = route.startsWith("/") ? route : `/${route}`;
  return `${BASE}${p.endsWith("/") ? p : `${p}/`}`;
}

async function checkRoute(route) {
  const url = pathUrl(route);
  let res;
  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "vc-e2e-smoke/1", Accept: "text/html" },
    });
  } catch (e) {
    return { route, url, ok: false, detail: `fetch: ${e?.message || e}` };
  }
  const body = await res.text();
  const title = body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || "";
  if (res.status !== 200) {
    return { route, url, ok: false, detail: `HTTP ${res.status}` };
  }
  if (!/vinili/i.test(title)) {
    return { route, url, ok: false, detail: `title mancante Vinili: "${title.slice(0, 80)}"` };
  }
  if (PLACEHOLDER.test(body)) {
    const m = body.match(PLACEHOLDER);
    return { route, url, ok: false, detail: `placeholder live: ${m?.[0]}` };
  }
  return { route, url, ok: true, detail: `OK · ${title.slice(0, 60)}` };
}

async function main() {
  console.log(`vc e2e smoke → ${BASE} (${ROUTES.length} rotte)\n`);
  const results = await Promise.all(ROUTES.map((r) => checkRoute(r)));
  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"} ${r.route.padEnd(18)} ${r.detail}`);
    if (!r.ok) {
      console.log(`       ${r.url}`);
      failed++;
    }
  }
  console.log(failed ? `\n${failed} fallit${failed === 1 ? "a" : "e"}.` : "\nTutte OK.");
  process.exit(failed ? 1 : 0);
}

main();
