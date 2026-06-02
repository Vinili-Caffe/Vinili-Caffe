const path = require("path");
const mongoose = require("mongoose");
const { loadEnvFiles } = require("../shared/runtime/fsRuntime");
const { getMongoUrl } = require("../shared/config/env");

loadEnvFiles(path.join(__dirname, "..", "Vinyls"));

async function main() {
  const guildId = process.argv[2] || "1329080093599076474";
  const dateKey = process.argv[3] || "";
  if (!dateKey) {
    console.error("Usage: node scripts/_delete-first-message-claim.js <guildId> <dateKey>");
    process.exit(1);
  }
  const config = require(path.join(__dirname, "..", "Vinyls", "config.json"));
  await mongoose.connect(getMongoUrl(config));
  const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../Vinyls/Schemas/Community/communitySchemas");
  const r = await SiteDocument.deleteOne({
    docType: SITE_DOCUMENT_TYPE.COMMUNITY_FIRST_MESSAGE_DAILY,
    guildId: String(guildId),
    dedupeKey: String(dateKey),
  });
  console.log("deleted", r.deletedCount);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});