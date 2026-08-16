const path = require("path");
const fs = require("fs");
const botRoot = "/opt/bot/Vinyls";
const repoRoot = "/opt/bot";
process.chdir(botRoot);
module.paths.unshift(path.join(repoRoot, "node_modules"));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}
loadEnvFile(path.join(repoRoot, ".env"));

const mongoose = require("mongoose");

(async () => {
  await mongoose.connect(process.env.MONGO_URL);
  const col = mongoose.connection.collection("activityuserprofiles");
  const docs = await col
    .find({ "profile.events.hogwarts.duel": { $exists: true } })
    .project({ userId: 1, guildId: 1, "profile.events.hogwarts.duel": 1 })
    .limit(8)
    .toArray();
  console.log(JSON.stringify(docs, null, 2));
  const count = await col.countDocuments({ "profile.events.hogwarts.duel.cooldownUntil": { $exists: true } });
  console.log("cooldownUntil count", count);
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
