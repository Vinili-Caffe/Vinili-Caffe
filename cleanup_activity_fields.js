const path = require("path");
const fs = require("fs");

const VINYLS_DIR = path.join(__dirname, "Vinyls");
const DOTENV_PATH = path.join(VINYLS_DIR, "node_modules", "dotenv");
const MONGOOSE_PATH = path.join(VINYLS_DIR, "node_modules", "mongoose");

if (!fs.existsSync(DOTENV_PATH) || !fs.existsSync(MONGOOSE_PATH)) {
  console.error("Non trovo node_modules in Vinyls. Assicurati che i moduli siano installati.");
  process.exit(1);
}

const dotenv = require(DOTENV_PATH);
const mongoose = require(MONGOOSE_PATH);

dotenv.config({ path: path.join(__dirname, ".env") });

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
