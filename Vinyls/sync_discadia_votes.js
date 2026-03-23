const { Client, GatewayIntentBits } = require("discord.js");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const MONGO_URL = process.env.MONGO_URL;
const TOKEN = process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL;
const CHANNEL_ID = "1442569123426074736";

if (!MONGO_URL || !TOKEN) {
    console.error("Missing MONGO_URL or DISCORD_TOKEN in .env");
    process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

async function syncVotes() {
    try {
        console.log("Connessione a MongoDB...");
        await mongoose.connect(MONGO_URL);
        console.log("Connesso a MongoDB.");

        const db = mongoose.connection.db;
        const collection = db.collection("activityuserprofiles");

        console.log("Accesso a Discord...");
        await client.login(TOKEN);
        console.log(`Bot online: ${client.user.tag}`);

        const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
        if (!channel) {
            console.error("Canale non trovato o bot senza permessi.");
            process.exit(1);
        }

        console.log(`Inizio scansione messaggi in ${channel.name}...`);
        
        let allMessages = [];
        let lastId = null;
        let batchCount = 0;
        const counts = new Map();
        const pattern = /un nuovo voto!/i;
        const userRegex = /<@!?(\d+)>/;

        while (true) {
            batchCount++;
            const options = { limit: 100 };
            if (lastId) options.before = lastId;
            
            const fetched = await channel.messages.fetch(options).catch((err) => {
                console.error("Errore fetch:", err.message);
                return null;
            });

            if (!fetched || fetched.size === 0) break;

            fetched.forEach(m => {
                m.embeds.forEach(e => {
                    if (pattern.test(e.title || "") || pattern.test(e.description || "")) {
                        const mention = (e.description || "").match(userRegex);
                        if (mention) {
                            const userId = mention[1];
                            counts.set(userId, (counts.get(userId) || 0) + 1);
                        }
                    }
                });
            });

            lastId = fetched.last().id;
            console.log(`Processati ${batchCount * 100} messaggi... (Voti trovati finora: ${Array.from(counts.values()).reduce((a, b) => a + b, 0)})`);
            
            // Per sicurezza, se il canale è enorme mettiamo un limite arbitrario per questa esecuzione manuale
            // Rimuovi se vuoi scansionare TUTTA la cronologia infinita
            if (batchCount > 1000) { // 100k messaggi
                console.warn("Raggiunto limite di scansione (100k messaggi).");
                break;
            }
        }

        console.log(`Scansione terminata. Utenti trovati: ${counts.size}`);

        console.log("Aggiornamento database...");
        let updated = 0;
        for (const [userId, count] of counts.entries()) {
            const res = await collection.updateOne(
                { userId: String(userId) },
                { $set: { "discadiaVote.voteCount": count } }
            );
            if (res.modifiedCount > 0) updated++;
        }

        console.log(`Sincronizzazione completata!`);
        console.log(`Totale voti ricalcolati: ${Array.from(counts.values()).reduce((a, b) => a + b, 0)}`);
        console.log(`Documenti aggiornati in activityuserprofiles: ${updated}`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error("ERRORE FATALE:", err);
        process.exit(1);
    }
}

syncVotes();
