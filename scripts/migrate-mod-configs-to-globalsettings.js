require("dotenv").config();
const mongoose = require("mongoose");
const { GlobalSettings } = require("../Vinyls/Schemas/Community/communitySchemas");

async function runMigration() {
  try {
    const mongoUrl = process.env.MONGO_URL_LOCAL || process.env.MONGO_URL;
    if (!mongoUrl) {
      console.error("MONGO_URL_LOCAL o MONGO_URL non sono definiti nel file .env");
      process.exit(1);
    }

    console.log(`Connessione al database in corso all'URL: ${mongoUrl.replace(/:[^:@]+@/, ":****@")}`);
    await mongoose.connect(mongoUrl);
    console.log("Connesso con successo al database.");

    const db = mongoose.connection.db;

    // Controlla se la collezione mod_configs esiste
    const collections = await db.listCollections({ name: "mod_configs" }).toArray();
    if (collections.length === 0) {
      console.log("La collezione 'mod_configs' non esiste nel database. Nessuna migrazione necessaria.");
      process.exit(0);
    }

    // Estrai tutti i documenti da mod_configs
    console.log("Recupero dati dalla collezione 'mod_configs'...");
    const modConfigs = await db.collection("mod_configs").find({}).toArray();
    console.log(`Trovati ${modConfigs.length} documenti da migrare.`);

    let migratedCount = 0;

    for (const config of modConfigs) {
      const guildId = String(config.guildId || "");
      if (!guildId) continue;

      // Crea l'oggetto per l'embedded schema usando i dati vecchi
      const modConfigData = {
        logChannelId: config.logChannelId || null,
        dmOnAction: config.dmOnAction !== undefined ? config.dmOnAction : true,
        caseCounter: config.caseCounter || 0,
        exemptRoles: Array.isArray(config.exemptRoles) ? config.exemptRoles : [],
        exemptChannels: Array.isArray(config.exemptChannels) ? config.exemptChannels : [],
      };

      // Aggiorna o crea il documento GlobalSettings con il nuovo modConfig nested
      const updateResult = await GlobalSettings.updateOne(
        { guildId },
        { 
          $set: { modConfig: modConfigData },
          $setOnInsert: { guildId } // Se inserisce un nuovo documento, setta anche il guildId
        },
        { upsert: true }
      );

      migratedCount++;
    }

    console.log(`Migrazione completata. Documenti migrati: ${migratedCount}`);

    // Elimina la vecchia collezione
    console.log("Eliminazione della vecchia collezione 'mod_configs' in corso...");
    await db.collection("mod_configs").drop();
    console.log("Collezione 'mod_configs' eliminata con successo.");

    // Informa che le references e i vecchi script sono già stati gestiti via codice (non ci sono file degli schemi vecchi rimasti)
    console.log("Tutte le modifiche e reference nel codice sono già aggiornate in modo da usare GlobalSettings.");

  } catch (error) {
    console.error("Errore durante la migrazione:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnesso dal database.");
    process.exit(0);
  }
}

runMigration();
