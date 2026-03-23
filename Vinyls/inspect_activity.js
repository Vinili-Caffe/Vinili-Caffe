const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

async function run() {
  await mongoose.connect(process.env.MONGO_URL);
  const db = mongoose.connection.db;
  const col = db.collection("activityuserprofiles");
  
  const doc = await col.findOne({});
  if (!doc) {
    console.log("ERRORE: Collezione vuota!");
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log("--- DEBUG DATABASE ---");
  console.log("Esempio ID nel DB:", doc.userId);
  console.log("Tipo di dato ID:", typeof doc.userId);
  console.log("Tutte le chiavi del documento:", Object.keys(doc).join(", "));
  
  // Test manuale per il tuo ID (Loree)
  const myId = "295500038401163264";
  const matchStr = await col.findOne({ userId: myId });
  const matchNum = await col.findOne({ userId: Number(myId) });

  console.log(`Corrispondenza Stringa: ${matchStr ? "SI" : "NO"}`);
  console.log(`Corrispondenza Numero: ${matchNum ? "SI" : "NO"}`);

  await mongoose.disconnect();
  process.exit(0);
}
run();
