const path = require("path");
const fs = require("fs");
const envPath = path.resolve(__dirname, "../../.env");
for (const line of fs.readFileSync(envPath, "utf8").split(/\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 1) continue;
  const key = t.slice(0, eq).trim();
  let val = t.slice(eq + 1).trim().replace(/\r/g, "");
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (key && process.env[key] == null) process.env[key] = val;
}

(async () => {
  const mongoose = require("mongoose");
  await mongoose.connect(process.env.MONGO_URL || process.env.MONGODB_URI, { maxPoolSize: 2 });
  const { getBotState, setBotState } = require("../Utils/BotState/botStateStore");
  const state = await getBotState("resocontoCompitoClaimsV1", { claims: {} });
  const claims = { ...(state.claims || {}) };
  let removed = 0;
  for (const key of Object.keys(claims)) {
    if (key.includes(":helper:")) continue;
    delete claims[key];
    removed += 1;
    console.log("unseed", key);
  }
  await setBotState("resocontoCompitoClaimsV1", { claims });
  console.log("kept", Object.keys(claims), "removed", removed);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
