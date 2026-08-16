/**
 * Generate tenant partnership i18n packs from Italian master → 19 languages (gtx).
 *
 * node Vinyls/Utils/Partner/tenantPartnershipI18n/scripts/generate-tenant-i18n.cjs
 * node Vinyls/Utils/Partner/tenantPartnershipI18n/scripts/generate-tenant-i18n.cjs --lang=en --force
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "generated");
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
  "Vinili",
  "Caffè",
  "Discord",
  "Partner Manager",
  "High Staff",
  "Premium",
  "GDPR",
  "EXP",
  "FAQ",
  "Wiki",
  "TTS",
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
    const re = new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    s = s.replace(re, push);
  }
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, push);
  s = s.replace(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g, push);
  s = s.replace(/<a?:[a-zA-Z0-9_]+:\d+>/g, push);
  s = s.replace(/`[^`]+`/g, push);
  s = s.replace(/&[a-zA-Z#0-9]+;/g, push);
  return { s, tokens };
}

function unprotect(str, tokens) {
  return String(str)
    .replace(/⟦T(\d+)⟧/gi, (_, n) => tokens[Number(n)] ?? "")
    .replace(/\[\[T(\d+)\]\]/gi, (_, n) => tokens[Number(n)] ?? "");
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

function atomicWriteJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, filePath);
}

function flattenNestedCopy(itObj) {
  /** Flatten { id: { title, desc, emoji? } } → title/desc keys; emoji kept from IT at apply time. */
  const flat = {};
  for (const [id, row] of Object.entries(itObj || {})) {
    if (!row || typeof row !== "object") continue;
    if (row.title != null) flat[`${id}.title`] = String(row.title);
    if (row.desc != null) flat[`${id}.desc`] = String(row.desc);
  }
  return flat;
}

function unflattenNestedCopy(itObj, flatLang) {
  const out = {};
  for (const [id, row] of Object.entries(itObj || {})) {
    out[id] = {
      ...(row.emoji != null ? { emoji: row.emoji } : {}),
      title: flatLang[`${id}.title`] != null ? flatLang[`${id}.title`] : row.title,
      desc: flatLang[`${id}.desc`] != null ? flatLang[`${id}.desc`] : row.desc,
    };
  }
  return out;
}

async function translateFlatDict(itDict, outPath, target, { force, concurrency, delayMs }) {
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
  console.log(`[${path.basename(path.dirname(outPath))}/${target.code}] ${uniqueItems.length} unique / ${needKeys.length} keys`);

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
    if (finished % 40 === 0 || finished === uniqueItems.length) {
      atomicWriteJson(outPath, out);
      console.log(`[${target.code}] ${finished}/${uniqueItems.length}`);
    }
  });
  for (const key of keys) {
    if (out[key] == null) out[key] = itDict[key];
  }
  atomicWriteJson(outPath, out);
  return out;
}

function loadItMasters() {
  // Load packs without applying generated (generated may not exist yet).
  // Temporarily unset env to avoid cycles.
  const packsPath = path.join(ROOT, "packs.js");
  delete require.cache[require.resolve(packsPath)];
  // Also clear nested requires that packs pulls in
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}tenantPartnershipI18n${path.sep}`)) {
      delete require.cache[key];
    }
  }
  process.env.VC_SKIP_GENERATED_I18N = "1";
  const { UI_PACKS, BADGE_COPY, OBJECTIVE_COPY } = require(packsPath);
  delete process.env.VC_SKIP_GENERATED_I18N;
  return {
    ui: { ...UI_PACKS.it },
    badgesFlat: flattenNestedCopy(BADGE_COPY.it),
    objectivesFlat: flattenNestedCopy(OBJECTIVE_COPY.it),
    badgeIt: BADGE_COPY.it,
    objectiveIt: OBJECTIVE_COPY.it,
  };
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
    Number((args.find((a) => a.startsWith("--delay=")) || "").split("=")[1] || 60) || 60,
  );

  const masters = loadItMasters();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  atomicWriteJson(path.join(OUT_DIR, "it-ui.json"), masters.ui);
  atomicWriteJson(path.join(OUT_DIR, "it-badges-flat.json"), masters.badgesFlat);
  atomicWriteJson(path.join(OUT_DIR, "it-objectives-flat.json"), masters.objectivesFlat);

  const list = only ? TARGETS.filter((t) => t.code === only) : TARGETS;
  await mapPool(list, only ? 1 : langConcurrency, async (t) => {
    await translateFlatDict(masters.ui, path.join(OUT_DIR, "ui", `${t.code}.json`), t, {
      force,
      concurrency,
      delayMs,
    });
    const badgesFlat = await translateFlatDict(
      masters.badgesFlat,
      path.join(OUT_DIR, "badges-flat", `${t.code}.json`),
      t,
      { force, concurrency, delayMs },
    );
    atomicWriteJson(
      path.join(OUT_DIR, "badges", `${t.code}.json`),
      unflattenNestedCopy(masters.badgeIt, badgesFlat),
    );
    const objFlat = await translateFlatDict(
      masters.objectivesFlat,
      path.join(OUT_DIR, "objectives-flat", `${t.code}.json`),
      t,
      { force, concurrency, delayMs },
    );
    atomicWriteJson(
      path.join(OUT_DIR, "objectives", `${t.code}.json`),
      unflattenNestedCopy(masters.objectiveIt, objFlat),
    );
  });

  console.log("Done. Generated under", OUT_DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
