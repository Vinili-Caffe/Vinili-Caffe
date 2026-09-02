const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const EXTRACTED = path.join(ROOT, "js", "i18n", "_extracted");
const OUT_DIR = path.join(ROOT, "js", "i18n", "locales");

const TARGETS = [
  { code: "en", gt: "en" },
  { code: "es", gt: "es" },
  { code: "fr", gt: "fr" },
  { code: "de", gt: "de" },
  { code: "pt", gt: "pt" },
  { code: "ru", gt: "ru" },
  { code: "zh", gt: "zh-CN" },
  { code: "ja", gt: "ja" },
  { code: "ko", gt: "ko" },
  { code: "ar", gt: "ar" },
  { code: "nl", gt: "nl" },
  { code: "pl", gt: "pl" },
  { code: "tr", gt: "tr" },
  { code: "hi", gt: "hi" },
  { code: "id", gt: "id" },
  { code: "uk", gt: "uk" },
  { code: "vi", gt: "vi" },
  { code: "ro", gt: "ro" },
  { code: "sv", gt: "sv" },
];

const BRANDS = [
  "Vinili & Caffè",
  "ViniliCaffeBot",
  "Vinili",
  "Caffè",
  "Discord",
  "Hogwarts",
  "Grifondoro",
  "Corvonero",
  "Tassorosso",
  "Serpeverde",
  "Gryffindor",
  "Ravenclaw",
  "Hufflepuff",
  "Slytherin",
  "Lavalink",
  "MongoDB",
  "PayPal",
  "Top.gg",
  "top.gg",
  "Discadia",
  "High Staff",
  "Partner Manager",
  "EXP",
  "FAQ",
  "Wiki",
  "GDPR",
  "OAuth",
  "TTS",
  "Premium",
  "Galeoni",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function protect(str) {
  const tokens = [];
  let s = String(str);
  const push = (match) => {
    const id = tokens.length;
    tokens.push(match);
    return `⟦T${id}⟧`;
  };
  for (const b of BRANDS) {
    if (!b) continue;
    const re = new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    s = s.replace(re, push);
  }
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, push);
  s = s.replace(/\{\{[A-Z0-9_]+\}\}/g, push);
  s = s.replace(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g, push);
  s = s.replace(/<a?:[a-zA-Z0-9_]+:\d+>/g, push);
  s = s.replace(/&[a-zA-Z#0-9]+;/g, push);
  return { s, tokens };
}

function unprotect(str, tokens) {
  return String(str)
    .replace(/⟦T(\d+)⟧/gi, (_, n) => tokens[Number(n)] ?? "")
    .replace(/\[\[T(\d+)\]\]/gi, (_, n) => tokens[Number(n)] ?? "");
}

function shouldSkipKey(key) {
  return String(key).startsWith("lang.");
}

async function translateGtx(text, gtLang) {
  const raw = String(text ?? "");
  if (!raw.trim()) return raw;
  if (/^[\s\d\W_]+$/u.test(raw) && !/[A-Za-zÀ-ÿ]/.test(raw)) return raw;
  const { s, tokens } = protect(raw);
  if (!s.trim()) return raw;

  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=it&tl=" +
    encodeURIComponent(gtLang) +
    "&dt=t&q=" +
    encodeURIComponent(s);

  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "*/*",
        },
      });
      if (res.status === 429) {
        await sleep(2500 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const out = Array.isArray(data?.[0])
        ? data[0].map((row) => (row && row[0] != null ? String(row[0]) : "")).join("")
        : "";
      if (!out) throw new Error("empty translation");
      return unprotect(out, tokens);
    } catch (err) {
      lastErr = err;
      await sleep(800 * (attempt + 1));
    }
  }
  throw lastErr || new Error("translate failed");
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

function isUsefulTranslation(src, dst) {
  if (dst == null || String(dst).length === 0) return false;
  if (dst === src && /[A-Za-zÀ-ÿ]/.test(src) && src.length > 2) return false;
  return true;
}

async function translateDict(itDict, target, { force, concurrency, delayMs }) {
  const outPath = path.join(OUT_DIR, `${target.code}.json`);
  let existing = {};
  if (!force && fs.existsSync(outPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
    } catch {
      existing = {};
    }
  }

  const keys = Object.keys(itDict);
  const out = { ...existing };
  const needKeys = [];

  for (const key of keys) {
    if (shouldSkipKey(key)) {
            if (out[key] == null) out[key] = itDict[key];
      continue;
    }
    if (!force && isUsefulTranslation(itDict[key], out[key])) continue;
    needKeys.push(key);
  }

  const uniqueMap = new Map();
  for (const key of needKeys) {
    const raw = itDict[key];
    const { s } = protect(raw);
    if (!uniqueMap.has(s)) uniqueMap.set(s, { raw, keys: [] });
    uniqueMap.get(s).keys.push(key);
  }
  const uniqueItems = [...uniqueMap.values()];
  console.log(`[${target.code}] ${uniqueItems.length} unique / ${needKeys.length} keys`);

  let finished = 0;
  await mapPool(uniqueItems, concurrency, async (item) => {
    try {
      const translated = await translateGtx(item.raw, target.gt);
      for (const key of item.keys) out[key] = translated;
    } catch (err) {
      console.warn(`[${target.code}] fail:`, err && err.message ? err.message : err);
      for (const key of item.keys) {
        if (out[key] == null) out[key] = item.raw;
      }
    }
    finished++;
    if (delayMs) await sleep(delayMs);
    if (finished % 50 === 0 || finished === uniqueItems.length) {
      atomicWriteJson(outPath, out);
      console.log(`[${target.code}] ${finished}/${uniqueItems.length}`);
    }
  });

  for (const key of keys) {
    if (out[key] == null) out[key] = itDict[key];
  }
    for (const key of Object.keys(existing)) {
    if (shouldSkipKey(key) && existing[key] != null) out[key] = existing[key];
  }
  atomicWriteJson(outPath, out);
  return out;
}

function atomicWriteJson(filePath, obj) {
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, filePath);
}

function buildLocalesBundle() {
  require("./rebuild-i18n-locales-bundle.cjs");
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = (args.find((a) => a.startsWith("--lang=")) || "").split("=")[1];
  const concurrency = Math.max(
    1,
    Number((args.find((a) => a.startsWith("--concurrency=")) || "").split("=")[1] || 2) || 2,
  );
  const langConcurrency = Math.max(
    1,
    Number((args.find((a) => a.startsWith("--langs=")) || "").split("=")[1] || 2) || 2,
  );
  const delayMs = Math.max(
    0,
    Number((args.find((a) => a.startsWith("--delay=")) || "").split("=")[1] || 80) || 80,
  );

  const masterPath = path.join(EXTRACTED, "master.json");
  const itPath = path.join(EXTRACTED, "it.json");
  if (!fs.existsSync(itPath) && !fs.existsSync(masterPath)) {
    throw new Error("Missing extracted IT master. Run: node scripts/extract-i18n-keys.cjs");
  }
  const it = JSON.parse(fs.readFileSync(fs.existsSync(masterPath) ? masterPath : itPath, "utf8"));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const list = only ? TARGETS.filter((t) => t.code === only) : TARGETS;
  if (!list.length) throw new Error("No target languages matched");

  await mapPool(list, only ? 1 : langConcurrency, async (t) => {
    await translateDict(it, t, { force, concurrency, delayMs });
  });

  if (!only) {
    const complete = TARGETS.filter((t) => {
      const p = path.join(OUT_DIR, `${t.code}.json`);
      if (!fs.existsSync(p)) return false;
      const d = JSON.parse(fs.readFileSync(p, "utf8"));
      let good = 0;
      for (const k of Object.keys(it)) {
        if (shouldSkipKey(k)) {
          good++;
          continue;
        }
        if (isUsefulTranslation(it[k], d[k])) good++;
      }
      const ratio = good / Object.keys(it).length;
      console.log(`[${t.code}] coverage ${(ratio * 100).toFixed(1)}% (${good}/${Object.keys(it).length})`);
      return ratio >= 0.9;
    });
    if (complete.length) buildLocalesBundle();
    console.log(`Ready: ${complete.map((t) => t.code).join(", ") || "(none)"}`);
    if (complete.length < TARGETS.length) process.exitCode = 2;
  } else {
    const p = path.join(OUT_DIR, `${only}.json`);
    const d = JSON.parse(fs.readFileSync(p, "utf8"));
    console.log(`[${only}] keys ${Object.keys(d).length}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
