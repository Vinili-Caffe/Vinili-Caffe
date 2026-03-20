const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const MONGO_URL =
  process.env.MONGO_URL_LOCAL ||
  process.env.MONGODB_URI_LOCAL ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI;

const LEGACY = {
  staffEventPoints: "staffeventpoints",
  staffEventWeeklyRewards: "staffeventweeklyrewards",
  staffEventRewardGivens: "staffeventrewardgivens",
  voteRoles: "voteroles",
  discadiaVoters: "discadiavoters",
  discadiaBumps: "discadiabumps",
  disboardBumps: "disboardbumps",
  bumpVoteRewards: "bumpvoterewards",
  minigameUsers: "minigameusers",
  supporterStatuses: "supporterstatuses",
  reviewRewards: "reviewrewards",
};

const TARGET = {
  staff: "staffs",
  profiles: "activityuserprofiles",
};

const STATE_USERS = {
  disboard: "__disboard_bump__",
  discadia: "__discadia_bump__",
};

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sameDate(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

async function connectDb() {
  if (!MONGO_URL) throw new Error("MONGO_URL/MONGODB_URI mancante in .env");
  await mongoose.connect(MONGO_URL);
  return mongoose.connection.db;
}

async function migrateAll(db, apply) {
  const staff = db.collection(TARGET.staff);
  const profiles = db.collection(TARGET.profiles);
  const report = {};

  const pointsDocs = await db.collection(LEGACY.staffEventPoints).find({}, { projection: { guildId: 1, userId: 1, points: 1 } }).toArray();
  report.staffEventPoints = { found: pointsDocs.length, migrated: 0 };
  if (apply && pointsDocs.length) {
    const ops = pointsDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $set: { "staffEvent.points": Math.max(0, Number(d.points || 0)) },
        },
        upsert: true,
      },
    }));
    const res = await staff.bulkWrite(ops, { ordered: false });
    report.staffEventPoints.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }

  const weeklyDocs = await db.collection(LEGACY.staffEventWeeklyRewards).find({}, { projection: { guildId: 1, userId: 1, week: 1 } }).toArray();
  report.staffEventWeeklyRewards = { found: weeklyDocs.length, migrated: 0 };
  if (apply && weeklyDocs.length) {
    const ops = weeklyDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $addToSet: { "staffEvent.weeklyRewards": Number(d.week || 0) },
        },
        upsert: true,
      },
    }));
    const res = await staff.bulkWrite(ops, { ordered: false });
    report.staffEventWeeklyRewards.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }

  const givenDocs = await db.collection(LEGACY.staffEventRewardGivens).find({}, { projection: { guildId: 1, userId: 1, rewardType: 1 } }).toArray();
  report.staffEventRewardGivens = { found: givenDocs.length, migrated: 0 };
  if (apply && givenDocs.length) {
    const ops = givenDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $addToSet: { "staffEvent.rewardGivenTypes": String(d.rewardType || "") },
        },
        upsert: true,
      },
    }));
    const res = await staff.bulkWrite(ops, { ordered: false });
    report.staffEventRewardGivens.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }

  const voteRoleDocs = await db.collection(LEGACY.voteRoles).find({}, { projection: { guildId: 1, userId: 1, expiresAt: 1, createdAt: 1 } }).toArray();
  report.voteRoles = { found: voteRoleDocs.length, migrated: 0 };
  if (apply && voteRoleDocs.length) {
    const ops = voteRoleDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $set: {
            "voteRole.expiresAt": toDate(d.expiresAt),
            "voteRole.grantedAt": toDate(d.createdAt) || toDate(d.expiresAt),
          },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.voteRoles.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }

  const voterDocs = await db.collection(LEGACY.discadiaVoters).find({}, { projection: { guildId: 1, userId: 1, lastVoteAt: 1, lastRemindedAt: 1, voteCount: 1, voteMilestoneGranted: 1, voteMilestoneNearReminded: 1 } }).toArray();
  report.discadiaVoters = { found: voterDocs.length, migrated: 0 };
  if (apply && voterDocs.length) {
    const ops = voterDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $set: {
            "discadiaVote.lastVoteAt": toDate(d.lastVoteAt),
            "discadiaVote.lastRemindedAt": toDate(d.lastRemindedAt),
            "discadiaVote.voteCount": Math.max(0, Number(d.voteCount || 0)),
            "discadiaVote.voteMilestoneGranted": Array.isArray(d.voteMilestoneGranted) ? d.voteMilestoneGranted.map((x) => Number(x)).filter(Number.isFinite) : [],
            "discadiaVote.voteMilestoneNearReminded": Array.isArray(d.voteMilestoneNearReminded) ? d.voteMilestoneNearReminded.map((x) => Number(x)).filter(Number.isFinite) : [],
          },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.discadiaVoters.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }

  const disboardDocs = await db.collection(LEGACY.disboardBumps).find({}, { projection: { guildId: 1, lastBumpAt: 1, lastBumpUserId: 1, reminderSentAt: 1 } }).toArray();
  report.disboardBumps = { found: disboardDocs.length, migrated: 0 };
  if (apply && disboardDocs.length) {
    const ops = disboardDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: STATE_USERS.disboard },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: STATE_USERS.disboard },
          $set: {
            "bumpState.disboard.lastBumpAt": toDate(d.lastBumpAt),
            "bumpState.disboard.lastBumpUserId": d.lastBumpUserId ? String(d.lastBumpUserId) : null,
            "bumpState.disboard.reminderSentAt": toDate(d.reminderSentAt),
          },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.disboardBumps.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }

  const discadiaBumpDocs = await db.collection(LEGACY.discadiaBumps).find({}, { projection: { guildId: 1, lastBumpAt: 1, lastBumpUserId: 1, reminderSentAt: 1 } }).toArray();
  report.discadiaBumps = { found: discadiaBumpDocs.length, migrated: 0 };
  if (apply && discadiaBumpDocs.length) {
    const ops = discadiaBumpDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: STATE_USERS.discadia },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: STATE_USERS.discadia },
          $set: {
            "bumpState.discadia.lastBumpAt": toDate(d.lastBumpAt),
            "bumpState.discadia.lastBumpUserId": d.lastBumpUserId ? String(d.lastBumpUserId) : null,
            "bumpState.discadia.reminderSentAt": toDate(d.reminderSentAt),
          },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.discadiaBumps.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }

  const bumpRewardDocs = await db.collection(LEGACY.bumpVoteRewards).find({}, { projection: { guildId: 1, userId: 1, source: 1, lastActionAt: 1, currentStreak: 1, bestStreak: 1, totalExpAwarded: 1 } }).toArray();
  report.bumpVoteRewards = { found: bumpRewardDocs.length, migrated: 0 };
  if (apply && bumpRewardDocs.length) {
    const ops = bumpRewardDocs.map((d) => {
      const source = String(d.source || "");
      return {
        updateOne: {
          filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          update: {
            $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
            $set: {
              [`bumpVoteRewards.${source}.lastActionAt`]: toDate(d.lastActionAt),
              [`bumpVoteRewards.${source}.currentStreak`]: Math.max(0, Number(d.currentStreak || 0)),
              [`bumpVoteRewards.${source}.bestStreak`]: Math.max(0, Number(d.bestStreak || 0)),
              [`bumpVoteRewards.${source}.totalExpAwarded`]: Math.max(0, Number(d.totalExpAwarded || 0)),
            },
          },
          upsert: true,
        },
      };
    });
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.bumpVoteRewards.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }

  const minigameDocs = await db.collection(LEGACY.minigameUsers).find({}, { projection: { guildId: 1, userId: 1, totalExp: 1, currentStreak: 1, bestStreak: 1 } }).toArray();
  report.minigameUsers = { found: minigameDocs.length, migrated: 0 };
  if (apply && minigameDocs.length) {
    const ops = minigameDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $set: {
            "minigame.totalExp": Math.max(0, Number(d.totalExp || 0)),
            "minigame.currentStreak": Math.max(0, Number(d.currentStreak || 0)),
            "minigame.bestStreak": Math.max(0, Number(d.bestStreak || 0)),
          },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.minigameUsers.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }

  const supporterDocs = await db.collection(LEGACY.supporterStatuses).find({}, { projection: { guildId: 1, userId: 1, lastMessageId: 1, lastSentAt: 1, hasLink: 1 } }).toArray();
  report.supporterStatuses = { found: supporterDocs.length, migrated: 0 };
  if (apply && supporterDocs.length) {
    const ops = supporterDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $set: {
            "supporterStatus.lastMessageId": d.lastMessageId ? String(d.lastMessageId) : null,
            "supporterStatus.lastSentAt": toDate(d.lastSentAt),
            "supporterStatus.hasLink": Boolean(d.hasLink),
          },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.supporterStatuses.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }

  const reviewDocs = await db.collection(LEGACY.reviewRewards).find({}, { projection: { guildId: 1, userId: 1, rewardedBy: 1, rewardedAt: 1 } }).toArray();
  report.reviewRewards = { found: reviewDocs.length, migrated: 0 };
  if (apply && reviewDocs.length) {
    const ops = reviewDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $set: {
            "reviewReward.rewardedBy": d.rewardedBy ? String(d.rewardedBy) : null,
            "reviewReward.rewardedAt": toDate(d.rewardedAt),
          },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.reviewRewards.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }
  return report;
}

async function verifyAll(db) {
  const staff = db.collection(TARGET.staff);
  const profiles = db.collection(TARGET.profiles);
  const out = {};

  let mismatches = 0;
  const pointsDocs = await db.collection(LEGACY.staffEventPoints).find({}).toArray();
  for (const d of pointsDocs) {
    const t = await staff.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { "staffEvent.points": 1 } });
    if (Number(t?.staffEvent?.points || 0) !== Number(d.points || 0)) mismatches += 1;
  }
  out.staffEventPoints = { total: pointsDocs.length, mismatches };

  mismatches = 0;
  const weeklyDocs = await db.collection(LEGACY.staffEventWeeklyRewards).find({}).toArray();
  for (const d of weeklyDocs) {
    const t = await staff.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { "staffEvent.weeklyRewards": 1 } });
    const arr = Array.isArray(t?.staffEvent?.weeklyRewards) ? t.staffEvent.weeklyRewards : [];
    if (!arr.includes(Number(d.week || 0))) mismatches += 1;
  }
  out.staffEventWeeklyRewards = { total: weeklyDocs.length, mismatches };

  mismatches = 0;
  const givenDocs = await db.collection(LEGACY.staffEventRewardGivens).find({}).toArray();
  for (const d of givenDocs) {
    const t = await staff.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { "staffEvent.rewardGivenTypes": 1 } });
    const arr = Array.isArray(t?.staffEvent?.rewardGivenTypes) ? t.staffEvent.rewardGivenTypes : [];
    if (!arr.includes(String(d.rewardType || ""))) mismatches += 1;
  }
  out.staffEventRewardGivens = { total: givenDocs.length, mismatches };

  mismatches = 0;
  const voteRoleDocs = await db.collection(LEGACY.voteRoles).find({}).toArray();
  for (const d of voteRoleDocs) {
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { voteRole: 1 } });
    if (!sameDate(t?.voteRole?.expiresAt, d.expiresAt)) mismatches += 1;
  }
  out.voteRoles = { total: voteRoleDocs.length, mismatches };

  mismatches = 0;
  const voterDocs = await db.collection(LEGACY.discadiaVoters).find({}).toArray();
  for (const d of voterDocs) {
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { discadiaVote: 1 } });
    const s = t?.discadiaVote || {};
    if (!sameDate(s.lastVoteAt, d.lastVoteAt) || Number(s.voteCount || 0) !== Number(d.voteCount || 0)) mismatches += 1;
  }
  out.discadiaVoters = { total: voterDocs.length, mismatches };

  mismatches = 0;
  const disboardDocs = await db.collection(LEGACY.disboardBumps).find({}).toArray();
  for (const d of disboardDocs) {
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: STATE_USERS.disboard }, { projection: { "bumpState.disboard": 1 } });
    const s = t?.bumpState?.disboard || {};
    if (!sameDate(s.lastBumpAt, d.lastBumpAt) || String(s.lastBumpUserId || "") !== String(d.lastBumpUserId || "")) mismatches += 1;
  }
  out.disboardBumps = { total: disboardDocs.length, mismatches };

  mismatches = 0;
  const discadiaBumpDocs = await db.collection(LEGACY.discadiaBumps).find({}).toArray();
  for (const d of discadiaBumpDocs) {
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: STATE_USERS.discadia }, { projection: { "bumpState.discadia": 1 } });
    const s = t?.bumpState?.discadia || {};
    if (!sameDate(s.lastBumpAt, d.lastBumpAt) || String(s.lastBumpUserId || "") !== String(d.lastBumpUserId || "")) mismatches += 1;
  }
  out.discadiaBumps = { total: discadiaBumpDocs.length, mismatches };

  mismatches = 0;
  const rewardDocs = await db.collection(LEGACY.bumpVoteRewards).find({}).toArray();
  for (const d of rewardDocs) {
    const source = String(d.source || "");
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { bumpVoteRewards: 1 } });
    const s = t?.bumpVoteRewards?.[source] || {};
    if (Number(s.currentStreak || 0) !== Number(d.currentStreak || 0) || Number(s.bestStreak || 0) !== Number(d.bestStreak || 0) || Number(s.totalExpAwarded || 0) !== Number(d.totalExpAwarded || 0)) mismatches += 1;
  }
  out.bumpVoteRewards = { total: rewardDocs.length, mismatches };

  mismatches = 0;
  const minigameDocs = await db.collection(LEGACY.minigameUsers).find({}).toArray();
  for (const d of minigameDocs) {
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { minigame: 1 } });
    const s = t?.minigame || {};
    if (Number(s.totalExp || 0) !== Number(d.totalExp || 0) || Number(s.currentStreak || 0) !== Number(d.currentStreak || 0) || Number(s.bestStreak || 0) !== Number(d.bestStreak || 0)) mismatches += 1;
  }
  out.minigameUsers = { total: minigameDocs.length, mismatches };

  mismatches = 0;
  const supporterDocs = await db.collection(LEGACY.supporterStatuses).find({}).toArray();
  for (const d of supporterDocs) {
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { supporterStatus: 1 } });
    const s = t?.supporterStatus || {};
    if (Boolean(s.hasLink) !== Boolean(d.hasLink) || String(s.lastMessageId || "") !== String(d.lastMessageId || "") || !sameDate(s.lastSentAt, d.lastSentAt)) mismatches += 1;
  }
  out.supporterStatuses = { total: supporterDocs.length, mismatches };

  mismatches = 0;
  const reviewDocs = await db.collection(LEGACY.reviewRewards).find({}).toArray();
  for (const d of reviewDocs) {
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { reviewReward: 1 } });
    const s = t?.reviewReward || {};
    if (String(s.rewardedBy || "") !== String(d.rewardedBy || "") || !sameDate(s.rewardedAt, d.rewardedAt)) mismatches += 1;
  }
  out.reviewRewards = { total: reviewDocs.length, mismatches };

  out.totalMismatches = Object.values(out).reduce((acc, row) => acc + Number(row?.mismatches || 0), 0);
  return out;
}

async function cleanupLegacyCollections(db) {
  const result = {};
  for (const name of Object.values(LEGACY)) {
    const del = await db.collection(name).deleteMany({}).catch(() => ({ deletedCount: 0 }));
    result[name] = Number(del?.deletedCount || 0);
  }
  return result;
}

module.exports = {
  connectDb,
  migrateAll,
  verifyAll,
  cleanupLegacyCollections,
};