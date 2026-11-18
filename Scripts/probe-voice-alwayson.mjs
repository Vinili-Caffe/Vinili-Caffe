import mongoose from "mongoose";

const uri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/test";
await mongoose.connect(uri);
const col = mongoose.connection.db.collection("botstates");

const legacy = await col.findOne({ key: "multiGuildVoice.v1" });
console.log("legacy voice?", Boolean(legacy), "guilds", legacy?.value ? Object.keys(legacy.value).length : 0);
if (legacy?.value && typeof legacy.value === "object") {
  for (const [gid, cfg] of Object.entries(legacy.value)) {
    const a = cfg?.music?.alwaysOn;
    if (a && (a.enabled || a.voiceChannelId)) {
      console.log("alwaysOn", gid, JSON.stringify(a));
    }
  }
}

const wake = await col.findOne({ key: "musicAlwaysOn.wake.v1" });
console.log("wake", JSON.stringify(wake?.value ?? null));

const compact = await col.findOne({ key: "botState.compact.v1" });
if (compact?.value?.["multiGuildVoice.v1"]) {
  console.log("compact has voice nested? unexpected");
}

await mongoose.disconnect();
