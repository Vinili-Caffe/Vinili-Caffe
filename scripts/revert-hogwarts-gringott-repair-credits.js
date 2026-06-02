/*!
 * Rimuove crediti errati "riparazione saldo" Hogwarts/Gringott e aggiorna il saldo.
 * Uso: node scripts/revert-hogwarts-gringott-repair-credits.js [--apply] [--guild=ID]
 */
const path = require("path");
const mongoose = require("mongoose");
const { loadEnvFiles } = require("../shared/runtime/fsRuntime");
const { getMongoUrl } = require("../shared/config/env");

loadEnvFiles(path.join(__dirname, "..", "Vinyls"));
const APPLY = process.argv.includes("--apply");
const GUILD_FILTER = (() => {
  const arg = process.argv.find((a) => a.startsWith("--guild="));
  return arg ? String(arg.split("=")[1] || "").trim() : "";
})();

const REPAIR_SOURCE = "hogwarts_sorting_repair";
const REPAIR_REASON_SNIPPET = "riparazione saldo";
const LEDGER_PATH = "profile.events.hogwarts.gringott.ledger";
const BALANCE_PATH = "profile.events.hogwarts.gringott.balance";
const EARNED_PATH = "profile.events.hogwarts.gringott.earned";

function isRepairLedgerEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  const source = String(entry.source || "").trim();
  const reason = String(entry.reason || "").trim().toLowerCase();
  if (source === REPAIR_SOURCE) return true;
  return reason.includes(REPAIR_REASON_SNIPPET);
}

function repairAmountFromEntry(entry) {
  const amt = Math.floor(Number(entry?.amount) || 0);
  return amt > 0 ? amt : 0;
}

async function main() {
  const mongoUrl = getMongoUrl(require(path.join(__dirname, "..", "Vinyls", "config.json")));
  if (!mongoUrl) {
    console.error("MONGO_URL mancante");
    process.exit(1);
  }
  await mongoose.connect(mongoUrl);
  const { ActivityUserProfile } = require("../Vinyls/Schemas/Community/communitySchemas");

  const query = {
    [`${LEDGER_PATH}.0`]: { $exists: true },
  };
  if (GUILD_FILTER) query.guildId = GUILD_FILTER;

  const cursor = ActivityUserProfile.find(query)
    .select(`guildId userId ${LEDGER_PATH} ${BALANCE_PATH} ${EARNED_PATH}`)
    .lean()
    .cursor();

  let scanned = 0;
  let affected = 0;
  let totalReverted = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const ledger = Array.isArray(doc?.profile?.events?.hogwarts?.gringott?.ledger)
      ? doc.profile.events.hogwarts.gringott.ledger
      : [];
    const repairEntries = ledger.filter(isRepairLedgerEntry);
    if (!repairEntries.length) continue;

    const revertSum = repairEntries.reduce((sum, row) => sum + repairAmountFromEntry(row), 0);
    if (revertSum < 1) continue;

    const balanceBefore = Math.max(0, Math.floor(Number(doc?.profile?.events?.hogwarts?.gringott?.balance) || 0));
    const earnedBefore = Math.max(0, Math.floor(Number(doc?.profile?.events?.hogwarts?.gringott?.earned) || 0));
    const balanceAfter = Math.max(0, balanceBefore - revertSum);
    const earnedAfter = Math.max(balanceAfter, earnedBefore - revertSum);
    const ledgerAfter = ledger.filter((row) => !isRepairLedgerEntry(row));

    affected += 1;
    totalReverted += revertSum;
    console.log(
      `${APPLY ? "[APPLY]" : "[DRY]"} guild=${doc.guildId} user=${doc.userId} -${revertSum} balance ${balanceBefore}→${balanceAfter} entries=${repairEntries.length}`,
    );

    if (APPLY) {
      await ActivityUserProfile.updateOne(
        { guildId: doc.guildId, userId: doc.userId },
        {
          $set: {
            [BALANCE_PATH]: balanceAfter,
            [EARNED_PATH]: earnedAfter,
            [LEDGER_PATH]: ledgerAfter,
          },
        },
      );
    }
  }

  console.log(
    `Done. scanned=${scanned} affected=${affected} totalReverted=${totalReverted} mode=${APPLY ? "apply" : "dry-run"}`,
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});