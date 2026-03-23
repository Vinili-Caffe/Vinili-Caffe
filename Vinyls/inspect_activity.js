const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

async function run() {
  await mongoose.connect(process.env.MONGO_URL);
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  for (const c of collections) {
     const n = c.name;
     const count = await db.collection(n).countDocuments();
     console.log(`${n}: ${count}`);
  }
  await mongoose.disconnect();
}
run();
