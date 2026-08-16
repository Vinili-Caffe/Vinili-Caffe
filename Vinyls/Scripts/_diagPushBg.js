#!/usr/bin/env node
const fs = require("fs");
for (const line of fs.readFileSync("/opt/bot/.env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 1) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (k && process.env[k] == null) process.env[k] = v;
}
process.chdir("/opt/bot");
const mongoose = require("mongoose");
(async () => {
  console.log("web-push", !!require.resolve("web-push"));
  const uri = process.env.MONGO_URL_LOCAL || process.env.MONGO_URL;
  await mongoose.connect(uri);
  const { SiteDocument, SITE_DOCUMENT_TYPE } = require("/opt/bot/Vinyls/Schemas/Community/communitySchemas");
  const docs = await SiteDocument.find({
    userId: "295500038401163264",
    inAppNotifAggregate: true,
  })
    .select("inAppNotifItems updatedAt")
    .lean();
  console.log("inbox_docs", docs.length);
  for (const d of docs) {
    const items = (d.inAppNotifItems || [])
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 8);
    console.log(
      "recent",
      items.map((i) => ({
        title: i.title,
        kind: i.notifKind,
        createdAt: i.createdAt,
      })),
    );
  }
  const { sendWebPushToUser } = require("/opt/bot/Vinyls/Utils/Web/siteWebPushService");
  const r = await sendWebPushToUser("295500038401163264", {
    title: "Test background push",
    body: "Se vedi questo SENZA aprire il sito, le push OS funzionano.",
    openUrl: "/",
    kind: "info",
    id: "bgtest-" + Date.now(),
  });
  console.log("push_result", r);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
