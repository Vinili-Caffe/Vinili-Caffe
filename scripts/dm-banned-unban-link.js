const path = require("path");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
} = require("discord.js");

const WORKSPACE_ROOT = path.resolve(__dirname, "..");
const BOT_ROOT = path.join(WORKSPACE_ROOT, "Vinyls");

const { loadEnvFiles } = require(path.join(WORKSPACE_ROOT, "shared", "runtime", "fsRuntime"));
const { getToken } = require(path.join(WORKSPACE_ROOT, "shared", "config", "env"));

loadEnvFiles(BOT_ROOT);

const IDs = require(path.join(BOT_ROOT, "Utils", "Config", "ids"));
const config = require(path.join(BOT_ROOT, "config.json"));

const DEFAULT_DELAY_MS = 1500;
const DEFAULT_LIMIT = 0;

function parseArgs(argv) {
  const rawArgs = argv.slice(2);
  const flags = new Set(rawArgs);
  const valueOf = (name) => {
    const hit = rawArgs.find((arg) => String(arg || "").startsWith(`${name}=`));
    return hit ? hit.slice(name.length + 1).trim() : "";
  };
  return {
    dryRun: !flags.has("--send"),
    guildId: valueOf("--guild-id") || String(IDs.guilds?.main || ""),
    limit: Math.max(0, Number(valueOf("--limit") || DEFAULT_LIMIT) || 0),
    delayMs: Math.max(0, Number(valueOf("--delay-ms") || DEFAULT_DELAY_MS) || DEFAULT_DELAY_MS),
    token: valueOf("--token") || getToken(config, "DISCORD_TOKEN_OFFICIAL"),
    unbanUrl: resolveUnbanUrl(valueOf("--url")),
  };
}

function resolveUnbanUrl(overrideUrl) {
  if (overrideUrl) return overrideUrl;
  const rawBase =
    String(process.env.WEBSITE_PUBLIC_URL || "").trim() ||
    String(process.env.VC_SITE_URL || "").trim() ||
    "https://www.viniliecaffe.it";
  const base = rawBase.replace(/\/+$/, "");
  return `${base}/unban`;
}

function wait(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function buildDmPayload(unbanUrl) {
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Richiesta unban disponibile")
    .setDescription(
      [
        "Ciao, ti scriviamo da **Vinili & Caffe**.",
        "",
        "Se vuoi richiedere la revisione del tuo ban, puoi compilare il modulo unban sul nostro sito.",
        "Lo staff valutera la richiesta e riceverai aggiornamenti appena possibile.",
      ].join("\n"),
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Apri richiesta unban")
      .setURL(unbanUrl),
  );

  return { embeds: [embed], components: [row] };
}

async function fetchAllBans(guild) {
  const out = [];
  let after = undefined;
  while (true) {
    const batch = await guild.bans.fetch({ limit: 1000, after });
    if (!batch.size) break;
    const values = [...batch.values()];
    out.push(...values);
    if (batch.size < 1000) break;
    after = values[values.length - 1]?.user?.id;
    if (!after) break;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.token) {
    throw new Error("Token mancante. Imposta DISCORD_TOKEN_OFFICIAL/DISCORD_TOKEN oppure usa --token=...");
  }
  if (!args.guildId) {
    throw new Error("Guild ID mancante. Usa --guild-id=...");
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(args.token);
  try {
    const guild = await client.guilds.fetch(args.guildId);
    if (!guild) throw new Error(`Guild non trovata: ${args.guildId}`);

    const bans = await fetchAllBans(guild);
    const rows = args.limit > 0 ? bans.slice(0, args.limit) : bans;
    const payload = buildDmPayload(args.unbanUrl);

    console.log(
      `[dm-banned-unban] Guild=${guild.name} (${guild.id}) ban=${bans.length} target=${rows.length} dryRun=${args.dryRun} url=${args.unbanUrl}`,
    );

    let sent = 0;
    let failed = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const user = rows[i]?.user;
      if (!user?.id || user.bot) continue;
      const label = `${user.tag || user.username || "unknown"} (${user.id})`;
      if (args.dryRun) {
        console.log(`[dry-run] ${i + 1}/${rows.length} DM -> ${label}`);
        continue;
      }
      try {
        await user.send(payload);
        sent += 1;
        console.log(`[sent] ${i + 1}/${rows.length} ${label}`);
      } catch (err) {
        failed += 1;
        console.warn(`[failed] ${i + 1}/${rows.length} ${label}: ${err?.message || err}`);
      }
      if (args.delayMs > 0 && i < rows.length - 1) await wait(args.delayMs);
    }

    console.log(`[dm-banned-unban] completato. sent=${sent} failed=${failed} dryRun=${args.dryRun}`);
    if (args.dryRun) {
      console.log("[dm-banned-unban] Per inviare davvero: node scripts/dm-banned-unban-link.js --send");
    }
  } finally {
    client.destroy();
  }
}

main().catch((err) => {
  console.error("[dm-banned-unban] errore:", err?.stack || err?.message || err);
  process.exitCode = 1;
});
