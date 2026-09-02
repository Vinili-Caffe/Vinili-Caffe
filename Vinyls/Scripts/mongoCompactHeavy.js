/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const candidates = ["/opt/bot/.env", path.join(__dirname, "..", "..", ".env")];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
    break;
  }
}

function argNum(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.slice(name.length + 3));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

async function main() {
  loadEnv();
  const doRun = process.argv.includes("--run");
  const top = argNum("top", 8);
  const mongoUrl =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGO_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI;
  if (!mongoUrl) {
    console.error("Missing MONGO_URL_LOCAL");
    process.exit(1);
  }

  const mongoose = require("mongoose");
  await mongoose.connect(mongoUrl);
  const db = mongoose.connection.db;
  console.log("DB:", db.databaseName);

  const names = await db.listCollections().toArray();
  const rows = [];
  for (const c of names) {
    const n = c.name;
    if (!n || n.startsWith("system.")) continue;
    let s;
    try {
      s = await db.command({ collStats: n, scale: 1024 * 1024 });
    } catch (e) {
      console.warn("stats fail", n, e?.message || e);
      continue;
    }
    rows.push({
      name: n,
      count: s.count || 0,
      dataMB: Math.round((s.size || 0) * 10) / 10,
      storageMB: Math.round((s.storageSize || 0) * 10) / 10,
      totalIndexMB: Math.round((s.totalIndexSize || 0) * 10) / 10,
    });
  }
  rows.sort((a, b) => b.storageMB - a.storageMB);

  console.log("\nTop collections by storageSize:");
  for (const r of rows.slice(0, 20)) {
    console.log(
      `${String(r.storageMB).padStart(8)} MB storage | ${String(r.dataMB).padStart(8)} MB data | ${String(r.totalIndexMB).padStart(6)} MB idx | ${String(r.count).padStart(8)} docs | ${r.name}`,
    );
  }

  if (!doRun) {
    console.log("\nDry-run only. Re-run with --run to compact the heaviest collections.");
    await mongoose.disconnect();
    return;
  }

  const targets = rows.slice(0, top).filter((r) => r.storageMB >= 1);
  console.log(`\nCompacting ${targets.length} collections (top ${top}, >=1MB storage)...`);
  for (const t of targets) {
    const before = t.storageMB;
    process.stdout.write(`compact ${t.name} (${before} MB)... `);
    try {
            const res = await db.command({ compact: t.name, force: true });
      let after = before;
      try {
        const s2 = await db.command({ collStats: t.name, scale: 1024 * 1024 });
        after = Math.round((s2.storageSize || 0) * 10) / 10;
      } catch {
              }
      console.log(`ok ${before} → ${after} MB`, res?.ok === 1 ? "" : res);
    } catch (e) {
      console.log("FAIL:", e?.message || e);
    }
  }

  await mongoose.disconnect();
  console.log("Done. Nessun documento cancellato: compact riscrive solo lo storage.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
