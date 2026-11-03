/**
 * Un solo processo per ricevere i voti: Top.gg (porta 3014) e Discadia (porta 3010), prima due processi pm2.
 * Resta separato dai worker di sfondo apposta: è leggero e non deve fermarsi se un worker si blocca,
 * altrimenti i voti andrebbero persi. I due file restano avviabili anche da soli.
 */
const { startTopggIntake } = require("./topggVoteIntakeApp") as typeof import("./topggVoteIntakeApp");
const { startDiscadiaIntake } = require("./discadiaVoteIntakeApp") as typeof import("./discadiaVoteIntakeApp");

async function main() {
  await startTopggIntake();
  await startDiscadiaIntake();
}

main().catch((err?) => {
  console.error("[VOTE INTAKE] fatal:", err);
  process.exit(1);
});
