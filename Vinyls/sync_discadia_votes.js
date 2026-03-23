const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const MONGO_URL = process.env.MONGO_URL_LOCAL || process.env.MONGO_URL;
const TOKEN = process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL;
const CHANNEL_ID = "1442569123426074736";

async function sync() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
  
  try {
    console.log("Connessione a:", MONGO_URL.replace(/:.+@/, ":***@"));
    await mongoose.connect(MONGO_URL);
    const col = mongoose.connection.db.collection("activityuserprofiles");
    
    await client.login(TOKEN);
    console.log(`Bot online: ${client.user.tag}`);

    const channel = await client.channels.fetch(CHANNEL_ID);
    const counts = new Map();
    let lastId = null;

    console.log("Scansione voti Discadia (10.000 messaggi max)...");
    for (let i = 0; i < 100; i++) {
        const msgs = await channel.messages.fetch({ limit: 100, before: lastId });
        if (msgs.size === 0) break;
        msgs.forEach(m => {
            m.embeds.forEach(e => {
                if (/un nuovo voto!/i.test(e.title || e.description || "")) {
                    const match = (e.description || "").match(/<@!?(\d+)>/);
                    if (match) counts.set(match[1], (counts.get(match[1]) || 0) + 1);
                }
            });
        });
        lastId = msgs.last().id;
        if (i % 10 === 0 && i > 0) console.log(`  Processati ${i * 100} messaggi...`);
    }

    console.log(`Trovati ${counts.size} utenti votanti. Inizio aggiornamento DB...`);
    
    let updated = 0;
    let totalVotes = 0;
    
    for (const [uId, count] of counts.entries()) {
        totalVotes += count;
        // Uso $or per trovare sia ID stringa che ID numerici (legacy)
        const res = await col.updateOne(
            { $or: [{ userId: uId }, { userId: Number(uId) }] },
            { $set: { "discadiaVote.voteCount": count } }
        );
        if (res.matchedCount > 0) {
            updated++;
        }
    }

    console.log("\nSincronizzazione completata!");
    console.log(`- Voti totali ricalcolati: ${totalVotes}`);
    console.log(`- Utenti aggiornati nel DB: ${updated}`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("ERRORE:", err);
    process.exit(1);
  }
}

sync();
