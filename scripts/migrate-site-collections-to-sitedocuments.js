/**
 * Copia le vecchie collection site* in `sitedocuments` con campo `docType`.
 *
 *   node scripts/migrate-site-collections-to-sitedocuments.js
 *   node scripts/migrate-site-collections-to-sitedocuments.js --apply
 *   node scripts/migrate-site-collections-to-sitedocuments.js --apply --drop-old-collections
 */
const path = require("path");
const mongoose = require("mongoose");

const WORKSPACE_ROOT = path.resolve(__dirname, "..");
const BOT_ROOT = path.join(WORKSPACE_ROOT, "Vinyls");

const { loadEnvFiles } = require(path.join(WORKSPACE_ROOT, "shared", "runtime", "fsRuntime"));
const { getMongoUrl } = require(path.join(WORKSPACE_ROOT, "shared", "config", "env"));

loadEnvFiles(BOT_ROOT);

const config = require(path.join(BOT_ROOT, "config.json"));

const DT = {
  IN_APP_NOTIFICATION: "in_app_notification",
  ROLE_REQUEST_COOLDOWN: "role_request_cooldown",
  REVIEW: "review",
  SUGGESTION: "suggestion",
  PAYMENT: "payment",
};

function parseArgs(argv) {
  const raw = argv.slice(2);
  const flags = new Set(raw.filter((a) => !String(a).includes("=")));
  const findValue = (prefix) => {
    const hit = raw.find((arg) => String(arg || "").startsWith(`${prefix}=`));
    return hit ? String(hit.slice(prefix.length + 1)).trim() : "";
  };
  return {
    apply: flags.has("--apply"),
    dropOld: flags.has("--drop-old-collections"),
    mongoUrl: findValue("--mongo-url"),
  };
}

function stripUndefined(obj) {
  const out = {};
  Object.keys(obj || {}).forEach((k) => {
    if (obj[k] !== undefined) out[k] = obj[k];
  });
  return out;
}

async function insertManyOrderedFalse(dest, docs) {
  if (!docs.length) return { n: 0, errors: [] };
  const errors = [];
  let n = 0;
  for (const d of docs) {
    try {
      await dest.insertOne(d);
      n += 1;
    } catch (e) {
      errors.push({ id: d._id, message: e?.message || String(e) });
    }
  }
  return { n, errors };
}

async function main() {
  const args = parseArgs(process.argv);
  const mongoUrl = args.mongoUrl || getMongoUrl(config);
  if (!mongoUrl) {
    console.error("Manca l'URL Mongo (config/env o --mongo-url=...).");
    process.exit(1);
  }

  await mongoose.connect(mongoUrl);
  const db = mongoose.connection.db;
  const dest = db.collection("sitedocuments");

  const existing = await dest.countDocuments().catch(() => 0);
  console.log(args.apply ? "[APPLY]" : "[DRY-RUN]", "documenti già in sitedocuments:", existing);

  const notif = await db.collection("siteinappnotifications").find({}).toArray();
  const cooldown = await db.collection("siterolerequestcooldowns").find({}).toArray();
  const reviews = await db.collection("sitereviews").find({}).toArray();
  const suggestions = await db.collection("sitesuggestions").find({}).toArray();
  const payments = await db.collection("sitepayments").find({}).toArray();

  console.log(
    "da migrare:",
    `notif=${notif.length} cooldown=${cooldown.length} reviews=${reviews.length} suggestions=${suggestions.length} payments=${payments.length}`,
  );

  const notifDocs = notif.map((row) =>
    stripUndefined({
      _id: row._id,
      docType: DT.IN_APP_NOTIFICATION,
      guildId: row.guildId,
      userId: row.userId,
      title: row.title,
      body: row.body,
      notifKind: row.kind != null ? row.kind : row.notifKind,
      openUrl: row.openUrl,
      dedupeKey: row.dedupeKey,
      readAt: row.readAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }),
  );

  const cooldownDocs = cooldown.map((row) =>
    stripUndefined({
      _id: row._id,
      docType: DT.ROLE_REQUEST_COOLDOWN,
      guildId: row.guildId,
      requesterId: row.requesterId,
      roleId: row.roleId,
      ownerId: row.ownerId,
      lastRequestedAt: row.lastRequestedAt,
      cooldownUntil: row.cooldownUntil,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }),
  );

  const reviewDocs = reviews.map((row) =>
    stripUndefined({
      _id: row._id,
      docType: DT.REVIEW,
      guildId: row.guildId,
      reviewKind: row.reviewKind != null ? row.reviewKind : row.kind,
      userId: row.userId,
      staffUserId: row.staffUserId,
      rating: row.rating,
      content: row.content,
      authorName: row.authorName,
      authorAvatarUrl: row.authorAvatarUrl,
      staffName: row.staffName,
      staffAvatarUrl: row.staffAvatarUrl,
      likedUserIds: row.likedUserIds,
      serverReplyContent: row.serverReplyContent,
      serverReplyAt: row.serverReplyAt,
      serverReplyAuthorId: row.serverReplyAuthorId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }),
  );

  const suggestionDocs = suggestions.map((row) =>
    stripUndefined({
      _id: row._id,
      docType: DT.SUGGESTION,
      guildId: row.guildId,
      userId: row.userId,
      authorName: row.authorName,
      authorAvatarUrl: row.authorAvatarUrl,
      content: row.content,
      status: row.status,
      staffReason: row.staffReason,
      staffUserId: row.staffUserId,
      decidedAt: row.decidedAt,
      comments: row.comments,
      upvoterUserIds: row.upvoterUserIds,
      downvoterUserIds: row.downvoterUserIds,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }),
  );

  const paymentDocs = payments.map((row) =>
    stripUndefined({
      _id: row._id,
      docType: DT.PAYMENT,
      guildId: row.guildId,
      userId: row.userId,
      provider: row.provider,
      createdBy: row.createdBy,
      planKey: row.planKey,
      description: row.description,
      amount: row.amount,
      currency: row.currency,
      paymentStatus: row.paymentStatus != null ? row.paymentStatus : row.status,
      orderId: row.orderId,
      captureId: row.captureId,
      approveUrl: row.approveUrl,
      webhookEventType: row.webhookEventType,
      webhookEventId: row.webhookEventId,
      rawOrder: row.rawOrder,
      rawCapture: row.rawCapture,
      rawWebhook: row.rawWebhook,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }),
  );

  const all = [...notifDocs, ...cooldownDocs, ...reviewDocs, ...suggestionDocs, ...paymentDocs];
  if (!args.apply) {
    console.log("dry-run: verrebbero inseriti fino a", all.length, "documenti (skip su _id duplicato).");
    await mongoose.disconnect();
    return;
  }

  const r = await insertManyOrderedFalse(dest, all);
  console.log("inseriti:", r.n, "errori:", r.errors.length);
  if (r.errors.length && r.errors.length <= 20) console.log(r.errors);

  if (args.dropOld) {
    const names = [
      "siteinappnotifications",
      "siterolerequestcooldowns",
      "sitereviews",
      "sitesuggestions",
      "sitepayments",
    ];
    for (const name of names) {
      try {
        await db.collection(name).drop();
        console.log("dropped", name);
      } catch (e) {
        console.error("drop", name, e?.message || e);
      }
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});