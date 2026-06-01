const mongoose = require("mongoose");
const url = process.env.MONGO_URL_LOCAL || process.env.MONGO_URL;
const ids = ["700814270069342339", "295500038401163264", "470373387609571339", "610531025470095390"];
const gid = "1329080093599076474";

(async () => {
  await mongoose.connect(url);
  const db = mongoose.connection.db;
  console.log("DB", db.databaseName, "via", process.env.MONGO_URL_LOCAL ? "LOCAL" : "ATLAS");
  for (const uid of ids) {
    const profG = await db.collection("activityuserprofiles").findOne({ guildId: gid, userId: uid });
    const profAny = await db.collection("activityuserprofiles").find({ userId: uid }).toArray();
    const sort = await db.collection("sitedocuments").find({ docType: "hogwarts_sorting", userId: uid }).toArray();
    console.log("---", uid);
    console.log("profiles count for userId:", profAny.length);
    for (const p of profAny) {
      console.log("  profile", p.guildId, JSON.stringify(p.profile?.events?.hogwarts || null));
    }
    console.log("profile main guild:", profG ? JSON.stringify(profG.profile?.events?.hogwarts || null) : null);
    console.log("sorting docs:", JSON.stringify(sort.map((d) => ({
      guildId: d.guildId,
      dedupeKey: d.dedupeKey,
      status: d.status,
      planKey: d.planKey,
    }))));
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});