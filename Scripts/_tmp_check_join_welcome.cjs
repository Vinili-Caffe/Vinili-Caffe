const fs = require("fs");
const mongoose = require("mongoose");

const dump = JSON.parse(fs.readFileSync("/home/ubuntu/.pm2/dump.pm2", "utf8"));
const proc = dump.find((x) => x.name === "bots-vinyls");
const uri = proc?.env?.MONGO_URL || proc?.env?.MONGO_URI;
if (!uri) throw new Error("no mongo uri in pm2 dump");

(async () => {
  await mongoose.connect(uri);
  const uid = "1439750867401048227";
  const gid = "1329080093599076474";
  const doc = await mongoose.connection.collection("activityuserprofiles").findOne(
    { guildId: gid, userId: uid },
    { projection: { profile: 1, updatedAt: 1 } },
  );
  console.log(JSON.stringify(doc, null, 2));
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(String(e && e.message ? e.message : e));
  process.exit(1);
});
