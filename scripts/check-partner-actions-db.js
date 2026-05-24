require("dotenv").config();

const mongoose = require("mongoose");
const { ActivityUserProfile } = require("../Vinyls/Schemas/Community/communitySchemas");
const { getPartnerLeaderboardWeekBoundsUtc } = require("../Vinyls/Services/Staff/weeklyStaffResocontoService");

const GUILD_ID = "1329080093599076474";
const USER_ID = process.argv[2] || "1147495356951695361";

function resolveMongoUrl(which) {
  if (which === "local") return process.env.MONGO_URL_LOCAL || process.env.MONGODB_URI_LOCAL || "";
  if (which === "remote") return process.env.MONGO_URL || process.env.MONGODB_URI || "";
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    ""
  );
}

function maskUrl(url) {
  return String(url || "").replace(/\/\/[^@/]+@/, "//***@");
}

async function inspect(label, url) {
  if (!url) {
    console.log(`[${label}] URL assente`);
    return;
  }
  await mongoose.disconnect().catch(() => null);
  await mongoose.connect(url, { serverSelectionTimeoutMS: 8000 });
  const dbName = mongoose.connection.db?.databaseName || "?";
  console.log(`\n[${label}] ${maskUrl(url)} db=${dbName}`);
  const doc = await ActivityUserProfile.findOne({ guildId: GUILD_ID, userId: USER_ID })
    .select("guildId userId staff.partnerCount staff.partnerActions")
    .lean();
  if (!doc) {
    console.log("  Documento NON trovato");
    return;
  }
  const actions = Array.isArray(doc.staff?.partnerActions) ? doc.staff.partnerActions : [];
  const week = getPartnerLeaderboardWeekBoundsUtc(new Date());
  const ws = week.weekStart.getTime();
  const we = week.weekEndExclusive.getTime();
  const weekCreates = actions.filter((a) => {
    if (String(a?.action || "").toLowerCase() !== "create") return false;
    const t = new Date(a?.date || 0).getTime();
    return Number.isFinite(t) && t >= ws && t < we;
  });
  console.log("  partnerCount:", doc.staff?.partnerCount ?? 0);
  console.log("  partnerActions total:", actions.length);
  console.log("  create this week:", weekCreates.length);
  if (weekCreates[0]) {
    console.log("  sample:", JSON.stringify({ partner: weekCreates[0].partner, date: weekCreates[0].date, invite: weekCreates[0].invite }));
  }
}

async function main() {
  const which = process.argv[3] || "all";
  if (which === "local" || which === "all") await inspect("LOCAL", resolveMongoUrl("local"));
  if (which === "remote" || which === "all") await inspect("REMOTE", resolveMongoUrl("remote"));
  if (which === "script") await inspect("SCRIPT_ORDER", resolveMongoUrl("script"));
  await mongoose.disconnect().catch(() => null);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});