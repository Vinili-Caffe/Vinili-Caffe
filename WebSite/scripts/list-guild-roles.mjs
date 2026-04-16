/**
 * Stampa ruoli guild (id, nome, position) per compilare staffRoleIds in site.config.json.
 * Uso: DISCORD_WEBSITE_BUILD_BOT_TOKEN=... npm run list-guild-roles
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CONFIG = path.join(ROOT, "site.config.json");

async function main() {
  const tok = process.env.DISCORD_WEBSITE_BUILD_BOT_TOKEN?.trim();
  if (!tok) {
    console.error("Imposta DISCORD_WEBSITE_BUILD_BOT_TOKEN.");
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  const gid = String(cfg.discordStaffListBuild?.guildId || "").trim();
  if (!gid) {
    console.error("Manca discordStaffListBuild.guildId in site.config.json.");
    process.exit(1);
  }
  const res = await fetch(`https://discord.com/api/v10/guilds/${gid}/roles`, {
    headers: {
      Authorization: `Bot ${tok}`,
      "User-Agent": "ViniliCaffeWebBuild/1.0 (list-roles)",
    },
  });
  if (!res.ok) {
    console.error("HTTP", res.status, await res.text().catch(() => ""));
    process.exit(1);
  }
  const roles = await res.json();
  if (!Array.isArray(roles)) {
    console.error("Risposta non valida");
    process.exit(1);
  }
  const sorted = [...roles].sort((a, b) => Number(b.position) - Number(a.position));
  for (const r of sorted) {
    const id = String(r.id || "");
    if (!id) continue;
    console.log(`${id}\tpos=${r.position}\t${String(r.name || "")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});