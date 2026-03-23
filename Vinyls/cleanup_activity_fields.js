const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoURL = process.env.MONGO_URL;

if (!mongoURL) {
  console.error("URL MongoDB non trovato nelle variabili d'ambiente (.env).");
  process.exit(1);
}

async function run() {
  try {
    console.log("Connessione a MongoDB...");
    await mongoose.connect(mongoURL);
    console.log("Connesso!");

    const db = mongoose.connection.db;
    const collection = db.collection("activityuserprofiles");

    console.log("Avvio pulizia collezione activityuserprofiles...");

    const result = await collection.updateMany(
      {},
      {
        $unset: {
          "discadiaVote.voteMilestoneGranted": "",
          "discadiaVote.voteMilestoneNearReminded": "",
          "profile.temporaryCommandPermissions": "",
          "profile.temporaryRoleGrants": ""
        }
      }
    );

    console.log(`Pulizia completata!`);
    console.log(`Documenti modificati: ${result.modifiedCount}`);

    await mongoose.disconnect();
    console.log("Disconnesso.");
    process.exit(0);
  } catch (err) {
    console.error("Errore durante l'esecuzione dello script:", err);
    process.exit(1);
  }
}

run();
