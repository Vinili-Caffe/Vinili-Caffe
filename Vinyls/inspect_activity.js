const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

async function run() {
  await mongoose.connect(process.env.MONGO_URL);
  const db = mongoose.connection.db;
  const col = db.collection("activityuserprofiles");
  const d = await col.findOne({ "voteDiscadia": { $exists: true } });
  if (d) console.log("FOUND VOTE_DISCADIA field at root!");
  else console.log("No VOTE_DISCADIA field at root.");
  await mongoose.disconnect();
}
run();
