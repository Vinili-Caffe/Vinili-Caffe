const path = require("path");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const mongoose = require("mongoose");

const WORKSPACE_ROOT = path.resolve(__dirname, "..");
const BOT_ROOT = path.join(WORKSPACE_ROOT, "Vinyls");

const { loadEnvFiles } = require(path.join(WORKSPACE_ROOT, "shared", "runtime", "fsRuntime"));
const { getMongoUrl, getToken } = require(path.join(WORKSPACE_ROOT, "shared", "config", "env"));

loadEnvFiles(BOT_ROOT);

const IDs = require(path.join(BOT_ROOT, "Utils", "Config", "ids"));
const config = require(path.join(BOT_ROOT, "config.json"));
const { ActivityUserProfile } = require(path.join(BOT_ROOT, "Schemas", "Community", "communitySchemas"));

const DISCADIA_VOTE_ROOT = "profile.totals.exp.bumpVoteRewards.discadia_vote";
const MESSAGE_BATCH_SIZE = 100;

function parseArgs(argv) {
  const rawArgs = argv.slice(2);
  const flags = new Set(rawArgs);
  const findValue = (prefix) => {
    const hit = rawArgs.find((arg) => String(arg || "").startsWith(`${prefix}=`));
    return hit ? hit.slice(prefix.length + 1) : "";
  };
  const dryRun = !flags.has("--apply");
  return {
    dryRun,
    mongoUrl: findValue("--mongo-url"),
    verbose: flags.has("--verbose"),
  };
}

function resolveMongoUrl(configObj, args) {
  if (args.mongoUrl) return String(args.mongoUrl).trim();
  return getMongoUrl(configObj);
}

function extractUserIdFromText(text) {
  const match = String(text || "").match(/<@!?(\d{17,22})>/);
  return match ? match[1] : "";
}

function flattenEmbedText(embed) {
  if (!embed) return "";
  const parts = [];
  const push = (value) => {
    if (typeof value === "string" && value.trim()) parts.push(value);
  };
  push(embed.title);
  push(embed.description);
  push(embed.url);
  push(embed.author?.name);
  push(embed.footer?.text);
  if (Array.isArray(embed.fields)) {
    for (const field of embed.fields) {
      push(field?.name);
      push(field?.value);
    }
  }
  const data = embed.data || embed._data;
  if (data) {
    push(data.title);
    push(data.description);
    push(data.url);
    push(data.author?.name);
    push(data.footer?.text);
    if (Array.isArray(data.fields)) {
      for (const field of data.fields) {
        push(field?.name);
        push(field?.value);
      }
    }
  }
  return parts.join("\n");
}

function getMessageTextParts(message) {
  const embed0 = message.embeds?.[0];
  const embedText = Array.isArray(message.embeds) ? message.embeds.map((e) => flattenEmbedText(e)).filter(Boolean).join("\n") : "";
  return {
    content: String(message.content || ""),
    embedText,
    embedTitle: String(embed0?.title || ""),
  };
}

function detectVoteListing(messageText) {
  const lowered = String(messageText || "").toLowerCase();
  if (/top\.gg|\btopgg\b/.test(lowered)) return "topgg";
  if (/discadia|discadia\.com/.test(lowered)) return "discadia";
  return "";
}

function looksLikeVoteText(messageText) {
  const text = String(messageText || "").toLowerCase();
  if (!text) return false;
  const hasVoteText =
    /has voted|voted for|just voted|cast (?:a )?vote|thank you for voting/.test(text) ||
    /ha votato|votato|ha espresso (?:il )?voto/.test(text);
  const looksLikeBump =
    /server has been bumped|has been successfully bumped|bump(?:ed)?\s*successfully|successfully bumped|bump complete|bump done|thanks for bumping|you can bump again/.test(text);
  return hasVoteText && !looksLikeBump;
}

async function resolveUserIdFromMessage(message, guild) {
  const { content, embedText, embedTitle } = getMessageTextParts(message);
  const idFromMention = extractUserIdFromText(content) || extractUserIdFromText(embedText) || extractUserIdFromText(embedTitle);
  if (idFromMention) return idFromMention;

  const combined = `${content}\n${embedText}\n${embedTitle}`;
  const nameMatch =
    combined.match(/(?:^|[\r\n])\s*!?\s*([^\s]+)\s+has voted/i) ||
    combined.match(/!?\s*([^\s]+)\s+has voted/i);
  const rawName = String(nameMatch?.[1] || "").replace(/^[!@#:_*`~\\\-\.]+|[!@#:_*`~\\\-\.]+$/g, "");
  if (!rawName) return "";

  const target = rawName.toLowerCase();
  const cached = guild.members.cache.find((member) => {
    const username = String(member?.user?.username || "").toLowerCase();
    const displayName = String(member?.displayName || "").toLowerCase();
    return username === target || displayName === target;
  });
  if (cached?.id) return String(cached.id);

  const fetched = await guild.members.fetch({ query: rawName, limit: 10 }).catch(() => null);
  if (!fetched?.size) return "";
  const exact = fetched.find((member) => {
    const username = String(member?.user?.username || "").toLowerCase();
    const displayName = String(member?.displayName || "").toLowerCase();
    return username === target || displayName === target;
  });
  return String((exact || fetched.first())?.id || "");
}

async function parseVoteRecord(message, context) {
  const { clientUserId, guild } = context;
  const { content, embedText, embedTitle } = getMessageTextParts(message);
  const combinedText = `${content}\n${embedText}\n${embedTitle}`;
  const listing = detectVoteListing(combinedText);
  if (!listing) return null;

  const isOwnVoteAck =
    String(message.author?.id || "") === clientUserId &&
    /un nuovo voto/i.test(embedTitle) &&
    /grazie .* per aver votato/i.test(embedText);

  const isAutomated = Boolean(message.author?.bot || message.applicationId || message.webhookId);
  if (!isOwnVoteAck && !(isAutomated && looksLikeVoteText(combinedText))) {
    return null;
  }

  const userId = await resolveUserIdFromMessage(message, guild);
  if (!userId) return null;

  return {
    messageId: String(message.id),
    userId,
    listing,
    createdAt: message.createdAt instanceof Date ? message.createdAt : new Date(message.createdTimestamp || Date.now()),
    source: isOwnVoteAck ? "bot_ack" : "automation",
  };
}

async function fetchAllChannelMessages(channel) {
  const out = [];
  let before = "";
  while (true) {
    const batch = await channel.messages.fetch({ limit: MESSAGE_BATCH_SIZE, ...(before ? { before } : {}) }).catch((err) => {
      throw new Error(`fetch messaggi fallita: ${err?.message || err}`);
    });
    if (!batch.size) break;
    const rows = Array.from(batch.values());
    out.push(...rows);
    before = String(rows[rows.length - 1]?.id || "");
    if (batch.size < MESSAGE_BATCH_SIZE) break;
  }
  return out;
}

function buildVoteState(records) {
  const perUser = new Map();
  for (const row of records) {
    if (!row?.userId || !row?.listing) continue;
    const leaf = perUser.get(row.userId) || {
      topgg: 0,
      discadia: 0,
      lastVoteAt: null,
      lastVoteListing: null,
    };
    if (row.listing === "topgg") leaf.topgg += 1;
    if (row.listing === "discadia") leaf.discadia += 1;
    if (!leaf.lastVoteAt || row.createdAt > leaf.lastVoteAt) {
      leaf.lastVoteAt = row.createdAt;
      leaf.lastVoteListing = row.listing;
    }
    perUser.set(row.userId, leaf);
  }
  return perUser;
}

async function main() {
  const args = parseArgs(process.argv);
  const token = getToken(config, "DISCORD_TOKEN_OFFICIAL");
  const mongoUrl = resolveMongoUrl(config, args);
  const guildId = String(config.mainGuildId || IDs.guilds?.main || "").trim();
  const channelId = String(IDs.channels?.supporters || "").trim();

  if (!token) throw new Error("Token Discord mancante.");
  if (!mongoUrl) throw new Error("URL Mongo locale mancante. Imposta MONGO_URL_LOCAL/MONGODB_URI_LOCAL oppure usa --mongo-url=<uri>.");
  if (!guildId) throw new Error("Guild ID principale mancante.");
  if (!channelId) throw new Error("Channel supporters mancante.");

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  let closed = false;
  const closeAll = async () => {
    if (closed) return;
    closed = true;
    await client.destroy().catch(() => {});
    await mongoose.disconnect().catch(() => {});
  };

  try {
    await mongoose.connect(mongoUrl);
    await client.login(token);
    await client.guilds.fetch();

    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId));
    const channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId));
    if (!channel?.isTextBased?.()) throw new Error("Il canale supporters non è testuale o non è accessibile.");

    console.log(`[vote-backfill] Modalita: ${args.dryRun ? "DRY RUN" : "APPLY"}`);
    console.log(`[vote-backfill] Scansione storico canale ${channelId}...`);

    const messages = await fetchAllChannelMessages(channel);
    console.log(`[vote-backfill] Messaggi letti: ${messages.length}`);

    const records = [];
    for (const message of messages) {
      const parsed = await parseVoteRecord(message, {
        clientUserId: String(client.user?.id || ""),
        guild,
      });
      if (parsed) records.push(parsed);
    }

    const deduped = Array.from(
      new Map(records.map((row) => [row.messageId, row])).values(),
    );
    const voteState = buildVoteState(deduped);

    let topggTotal = 0;
    let discadiaTotal = 0;
    for (const leaf of voteState.values()) {
      topggTotal += leaf.topgg;
      discadiaTotal += leaf.discadia;
    }

    console.log(`[vote-backfill] Voti trovati: ${deduped.length}`);
    console.log(`[vote-backfill] Utenti con voti: ${voteState.size}`);
    console.log(`[vote-backfill] Totale Top.gg: ${topggTotal}`);
    console.log(`[vote-backfill] Totale Discadia: ${discadiaTotal}`);

    const existingDocs = await ActivityUserProfile.find({
      guildId,
      $or: [
        { [`${DISCADIA_VOTE_ROOT}.voteCountTopgg`]: { $gt: 0 } },
        { [`${DISCADIA_VOTE_ROOT}.voteCountDiscadia`]: { $gt: 0 } },
        { [`${DISCADIA_VOTE_ROOT}.voteCount`]: { $gt: 0 } },
      ],
    })
      .select(`guildId userId ${DISCADIA_VOTE_ROOT}`)
      .lean();

    const existingWithVotes = new Set(existingDocs.map((doc) => String(doc.userId || "")).filter(Boolean));
    const allTargetUserIds = new Set([...voteState.keys(), ...existingWithVotes]);

    const ops = [];
    for (const userId of allTargetUserIds) {
      const leaf = voteState.get(userId) || { topgg: 0, discadia: 0, lastVoteAt: null, lastVoteListing: null };
      const setPayload = {
        [`${DISCADIA_VOTE_ROOT}.voteCountTopgg`]: leaf.topgg,
        [`${DISCADIA_VOTE_ROOT}.voteCountDiscadia`]: leaf.discadia,
      };
      if (leaf.lastVoteAt) {
        setPayload[`${DISCADIA_VOTE_ROOT}.lastVoteAt`] = leaf.lastVoteAt;
        setPayload[`${DISCADIA_VOTE_ROOT}.lastVoteListing`] = leaf.lastVoteListing;
      }
      ops.push({
        updateOne: {
          filter: { guildId, userId },
          update: {
            $setOnInsert: { guildId, userId },
            $set: setPayload,
            $unset: { [`${DISCADIA_VOTE_ROOT}.voteCount`]: "" },
          },
          upsert: true,
        },
      });
    }

    console.log(`[vote-backfill] Profili da aggiornare: ${ops.length}`);
    if (args.verbose) {
      const preview = Array.from(voteState.entries())
        .slice(0, 20)
        .map(([userId, leaf]) => `${userId} -> topgg=${leaf.topgg}, discadia=${leaf.discadia}, last=${leaf.lastVoteListing || "-"} ${leaf.lastVoteAt ? leaf.lastVoteAt.toISOString() : "-"}`);
      for (const line of preview) console.log(`[vote-backfill] ${line}`);
    }

    if (args.dryRun) {
      console.log("[vote-backfill] Nessuna scrittura eseguita. Usa --apply per aggiornare il DB.");
      return;
    }

    if (ops.length > 0) {
      const result = await ActivityUserProfile.bulkWrite(ops, { ordered: false });
      console.log(
        `[vote-backfill] DB aggiornato. matched=${result.matchedCount || 0} modified=${result.modifiedCount || 0} upserted=${result.upsertedCount || 0}`,
      );
    } else {
      console.log("[vote-backfill] Nessun aggiornamento necessario.");
    }
  } finally {
    await closeAll();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("[vote-backfill] Errore:", err?.stack || err?.message || err);
    process.exit(1);
  });