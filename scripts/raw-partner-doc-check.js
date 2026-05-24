require("dotenv").config();
const mongoose = require("mongoose");

async function main() {
  const url = process.env.MONGO_URL_LOCAL || process.env.MONGO_URL;
  await mongoose.connect(url);
  const col = mongoose.connection.db.collection("activityuserprofiles");
  const doc = await col.findOne(
    { guildId: "1329080093599076474", userId: "1147495356951695361" },
    { projection: { staff: 1, updatedAt: 1 } },
  );
  console.log(JSON.stringify({
    db: mongoose.connection.db.databaseName,
    updatedAt: doc?.updatedAt,
    partnerCount: doc?.staff?.partnerCount,
    actionsLen: Array.isArray(doc?.staff?.partnerActions) ? doc.staff.partnerActions.length : null,
    firstAction: doc?.staff?.partnerActions?.[0] || null,
  }, null, 2));
  const dupes = await col.find({ userId: "1147495356951695361" }).project({ guildId: 1, "staff.partnerCount": 1, "staff.partnerActions": 1 }).toArray();
  console.log("docs same userId:", dupes.length);
  for (const d of dupes) {
    const n = Array.isArray(d.staff?.partnerActions) ? d.staff.partnerActions.length : 0;
    console.log(" ", d.guildId, "count", d.staff?.partnerCount, "actions", n);
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});