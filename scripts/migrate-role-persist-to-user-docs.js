/**
 * Migra i documenti dalla collezione role_persist (un doc per ogni ruolo persistito)
 * alla collezione rolepersistusers (un doc per (guildId, userId) con array roles).
 *
 * SICUREZZA: senza --yes NON scrive nulla, solo conteggio. Con --yes esegue la migrazione e verifica.
 *
 * Uso:
 *   node scripts/migrate-role-persist-to-user-docs.js           → solo conteggio, nessuna scrittura
 *   node scripts/migrate-role-persist-to-user-docs.js --yes      → esegue migrazione + verifica
 *   node scripts/migrate-role-persist-to-user-docs.js --yes --force → svuota rolepersistusers e rifa la migrazione
 *
 * Richiede .env con MONGO_URL (o MONGO_URL_LOCAL / MONGODB_URI).
 * Dopo la migrazione puoi eliminare la collezione role_persist se la verifica è ok.
 */
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const MONGO_URL =
  process.env.MONGO_URL_LOCAL ||
  process.env.MONGODB_URI_LOCAL ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI;

const doRun = process.argv.includes("--yes");
const force = process.argv.includes("--force");

async function run() {
  if (!MONGO_URL) {
    console.error("Imposta MONGO_URL (o MONGO_URL_LOCAL) in .env");
    process.exit(1);
  }
  await mongoose.connect(MONGO_URL);
  const RolePersist = require("../Vinyls/Schemas/Moderation/rolePersistSchema");
  const { RolePersistUser } = require("../Vinyls/Schemas/Moderation/rolePersistSchema");
  const total = await RolePersist.countDocuments().catch(() => 0);
  console.log(`[migrate] Documenti in role_persist: ${total}`);
  if (total === 0) {
    console.log("[migrate] Nulla da migrare.");
    await mongoose.disconnect();
    return;
  }
  const existing = await RolePersistUser.countDocuments().catch(() => 0);
  if (existing > 0 && doRun && !force) {
    console.log(`[migrate] rolepersistusers ha già ${existing} documenti. Per evitare duplicati lo script non sovrascrive.`);
    console.log("[migrate] Per ri-migrare: svuota la collezione a mano oppure usa --yes --force");
    await mongoose.disconnect();
    return;
  }
  if (existing > 0 && doRun && force) {
    const deleted = await RolePersistUser.deleteMany({}).catch(() => ({ deletedCount: 0 }));
    console.log(`[migrate] --force: svuotata rolepersistusers (rimossi ${deleted?.deletedCount ?? 0} documenti). Proseguo con la migrazione.`);
  }
  if (!doRun) {
    const cursor = RolePersist.find({}).sort({ guildId: 1, userId: 1 }).lean().cursor();
    let usersCount = 0;
    let prevKey = null;
    for await (const doc of cursor) {
      const key = `${String(doc.guildId || "")}\n${String(doc.userId || "")}`;
      if (!doc.guildId || !doc.userId || !doc.roleId) continue;
      if (key !== prevKey) {
        usersCount++;
        prevKey = key;
      }
    }
    console.log(`[migrate] Modalità SICURA: nessuna scrittura (manca --yes).`);
    console.log(`[migrate] Utenti che verrebbero migrati: ${usersCount}. Documenti totali in origine: ${total}.`);
    console.log("\n[migrate] Per eseguire la migrazione: node scripts/migrate-role-persist-to-user-docs.js --yes");
    await mongoose.disconnect();
    return;
  }

  const cursor = RolePersist.find({}).sort({ guildId: 1, userId: 1 }).lean().cursor();
  let currentKey = null;
  let currentRoles = [];
  let usersProcessed = 0;
  const toInsert = [];
  const BATCH = 200;

  for await (const doc of cursor) {
    const guildId = String(doc.guildId || "");
    const userId = String(doc.userId || "");
    const roleId = String(doc.roleId || "");
    if (!guildId || !userId || !roleId) continue;
    const key = `${guildId}\n${userId}`;
    if (key !== currentKey) {
      if (currentKey && currentRoles.length > 0) {
        const [g, u] = currentKey.split("\n");
        toInsert.push({
          guildId: g,
          userId: u,
          roles: currentRoles,
        });
        usersProcessed++;
        if (toInsert.length >= BATCH) {
          await RolePersistUser.insertMany(toInsert);
          toInsert.length = 0;
        }
      }
      currentKey = key;
      currentRoles = [];
    }
    const roleEntry = {
      roleId,
      setBy: doc.setBy ? String(doc.setBy) : null,
      reason: String(doc.reason || "Nessun motivo fornito").slice(0, 512),
    };
    currentRoles.push(roleEntry);
  }
  if (currentKey && currentRoles.length > 0) {
    const [g, u] = currentKey.split("\n");
    toInsert.push({
      guildId: g,
      userId: u,
      roles: currentRoles,
    });
    usersProcessed++;
  }
  if (toInsert.length > 0) {
    await RolePersistUser.insertMany(toInsert);
  }
  console.log(`[migrate] Migrati ${usersProcessed} utenti in rolepersistusers.`);

  const verifyCount = await RolePersistUser.countDocuments().catch(() => 0);
  const agg = await RolePersistUser.aggregate([{ $project: { n: { $size: "$roles" } } }, { $group: { _id: null, total: { $sum: "$n" } } }]).catch(() => [{ total: 0 }]);
  const totalRolesNew = agg[0]?.total ?? 0;
  const ok = verifyCount === usersProcessed && totalRolesNew === total;
  console.log(`[migrate] Verifica: documenti in rolepersistusers = ${verifyCount} (attesi ${usersProcessed}). Ruoli totali = ${totalRolesNew} (attesi ${total}).`);
  if (!ok) {
    console.warn("[migrate] ATTENZIONE: i conteggi non coincidono. Controlla prima di eliminare role_persist.");
  } else {
    console.log("[migrate] Verifica ok. Puoi eliminare la collezione role_persist se non ti serve più.");
  }
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
})