const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const MONGO_URL = process.env.MONGO_URL_LOCAL || process.env.MONGO_URL;

async function run() {
  try {
    console.log("Connessione...");
    await mongoose.connect(MONGO_URL);
    
    const { databases } = await mongoose.connection.db.admin().listDatabases();
    
    for (const dbInfo of databases) {
      const dbName = dbInfo.name;
      if (["admin", "local", "config"].includes(dbName)) continue;

      const db = mongoose.connection.client.db(dbName);
      const allCols = await db.listCollections().toArray();
      const targets = allCols.map(c => c.name).filter(n => n.toLowerCase().includes("userprofile"));
      
      for (const colName of targets) {
        console.log(`Pulizia ${dbName}.${colName}...`);
        const res = await db.collection(colName).updateMany({}, {
          $unset: {
            "discadiaVote.voteMilestoneGranted": "",
            "discadiaVote.voteMilestoneNearReminded": "",
            "voteDiscadia": "",
            "profile.temporaryRoleGrants": "",
            "profile.temporaryCommandPermissions": "",
            "bumpState.discadia": ""
          }
        });
        console.log(` -> Modificati: ${res.modifiedCount}`);
      }
    }
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
