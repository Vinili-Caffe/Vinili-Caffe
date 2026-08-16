#!/usr/bin/env node
/** List push subs from the same Mongo the apps use (LOCAL first). */
const fs = require("fs");
const path = require("path");
const envPath = "/opt/bot/.env";
for (const line of fs.readFileSync(envPath, "utf8").split(/\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 1) continue;
  const key = t.slice(0, eq).trim();
  let val = t.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (key && process.env[key] == null) process.env[key] = val;
}
process.chdir("/opt/bot");
const mongoose = require("mongoose");
const uri =
  process.env.MONGO_URL_LOCAL ||
  process.env.MONGODB_URI_LOCAL ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI;
console.log("using_uri_host", String(uri).replace(/:\/\/[^@]+@/, "://***@").slice(0, 80));
(async () => {
  await mongoose.connect(uri);
  const { SiteDocument, SITE_DOCUMENT_TYPE } = require("/opt/bot/Vinyls/Schemas/Community/communitySchemas");
  const docs = await SiteDocument.find({ docType: SITE_DOCUMENT_TYPE.WEB_PUSH_SUBSCRIPTION })
    .select("userId pushEndpoint pushUserAgent updatedAt")
    .lean();
  console.log("count", docs.length);
  for (const d of docs) {
    let host = "";
    try {
      host = new URL(d.pushEndpoint).host;
    } catch (_) {}
    console.log(
      JSON.stringify({
        userId: d.userId,
        host,
        ua: String(d.pushUserAgent || "").slice(0, 140),
        updatedAt: d.updatedAt,
      }),
    );
  }
  if (process.argv[2] === "test" && docs[0]) {
    const { sendWebPushToUser } = require("/opt/bot/Vinyls/Utils/Web/siteWebPushService");
    const r = await sendWebPushToUser(docs[0].userId, {
      title: "Test push Vinili",
      body: "Se vedi questo, Web Push funziona anche in background.",
      openUrl: "/",
      kind: "info",
      id: "test-" + Date.now(),
    });
    console.log("test_send", r);
  }
  // Also count atlas if different
  const atlas = process.env.MONGO_URL;
  if (atlas && atlas !== uri) {
    await mongoose.disconnect();
    await mongoose.connect(atlas);
    const n = await SiteDocument.countDocuments({ docType: SITE_DOCUMENT_TYPE.WEB_PUSH_SUBSCRIPTION });
    console.log("atlas_count", n);
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
