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
const { SiteDocument, SITE_DOCUMENT_TYPE } = require(path.join(botRoot, "Schemas/Community/communitySchemas"));

(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGO_URL);
  const docs = await SiteDocument.find({
    docType: SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS,
    guildId: "1329080093599076474",
  })
    .select("dedupeKey rawWebhook.totals rawWebhook.total rawWebhook.byGame rawWebhook.eventKey")
    .lean();
  console.log(JSON.stringify(docs.map((d) => ({
    dedupeKey: d.dedupeKey,
    eventKey: d.rawWebhook?.eventKey,
    total: d.rawWebhook?.total,
    totals: d.rawWebhook?.totals,
    byGame: d.rawWebhook?.byGame,
  })), null, 2));
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
