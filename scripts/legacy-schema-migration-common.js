const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { ACTIVITY_MAIN_GUILD_ID } = require("../Vinyls/Schemas/Community/communitySchemas");

const MONGO_URL =
  process.env.MONGO_URL_LOCAL ||
  process.env.MONGODB_URI_LOCAL;

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
  afks: "afks",
  mentionReactions: "mentionreactions",
  avatarPrivacies: "avatarprivacies",
  bannerPrivacies: "bannerprivacies",
  quotePrivacies: "quoteprivacies",
  birthdayProfiles: "birthdayprofiles",
  customRoles: "customroles",
  inviteTracks: "invitetracks",
  inviteReminderStates: "invitereminderstates",
  noDmPreferences: "nodmpreferences",
  rolePersistUsers: "rolepersistusers",
  temporaryRoleGrants: "temporary_role_grants",
  temporaryCommandPermissions: "temporary_command_permissions",
  verificationTenures: "verificationtenures",
  oneTimeReminderUsers: "onetimereminderusers",
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
  const afkDocs = await db.collection(LEGACY.afks).find({}, { projection: { guildId: 1, userId: 1, message: 1, timestamp: 1, originalName: 1 } }).toArray();
  report.afks = { found: afkDocs.length, migrated: 0 };
  if (apply && afkDocs.length) {
    const ops = afkDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $set: {
            "profile.afk.message": String(d.message || ""),
            "profile.afk.timestamp": toDate(d.timestamp),
            "profile.afk.originalName": d.originalName == null ? null : String(d.originalName),
          },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.afks.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }
  const mentionDocs = await db.collection(LEGACY.mentionReactions).find({}, { projection: { guildId: 1, userId: 1, reactions: 1 } }).toArray();
  report.mentionReactions = { found: mentionDocs.length, migrated: 0 };
  if (apply && mentionDocs.length) {
    const ops = mentionDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $set: { "profile.mentionReaction.reactions": Array.isArray(d.reactions) ? d.reactions.map((x) => String(x)) : [] },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.mentionReactions.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }
  const avatarDocs = await db.collection(LEGACY.avatarPrivacies).find({}, { projection: { guildId: 1, userId: 1, blocked: 1, views: 1 } }).toArray();
  report.avatarPrivacies = { found: avatarDocs.length, migrated: 0 };
  if (apply && avatarDocs.length) {
    const ops = avatarDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $set: {
            "profile.privacy.avatar.blocked": Boolean(d.blocked),
            "profile.privacy.avatar.views": Math.max(0, Number(d.views || 0)),
          },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.avatarPrivacies.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }
  const bannerDocs = await db.collection(LEGACY.bannerPrivacies).find({}, { projection: { guildId: 1, userId: 1, blocked: 1, views: 1 } }).toArray();
  report.bannerPrivacies = { found: bannerDocs.length, migrated: 0 };
  if (apply && bannerDocs.length) {
    const ops = bannerDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $set: {
            "profile.privacy.banner.blocked": Boolean(d.blocked),
            "profile.privacy.banner.views": Math.max(0, Number(d.views || 0)),
          },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.bannerPrivacies.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }
  const quoteDocs = await db.collection(LEGACY.quotePrivacies).find({}, { projection: { guildId: 1, userId: 1, blocked: 1 } }).toArray();
  report.quotePrivacies = { found: quoteDocs.length, migrated: 0 };
  if (apply && quoteDocs.length) {
    const ops = quoteDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $set: { "profile.privacy.quote.blocked": Boolean(d.blocked) },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.quotePrivacies.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }
  const birthdayDocs = await db.collection(LEGACY.birthdayProfiles).find({}, { projection: { guildId: 1, userId: 1, day: 1, month: 1, birthYear: 1, showAge: 1, lastCelebratedYear: 1, registrationMessageId: 1, registrationChannelId: 1 } }).toArray();
  report.birthdayProfiles = { found: birthdayDocs.length, migrated: 0 };
  if (apply && birthdayDocs.length) {
    const ops = birthdayDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $set: {
            "profile.birthday.day": d.day == null ? null : Number(d.day),
            "profile.birthday.month": d.month == null ? null : Number(d.month),
            "profile.birthday.birthYear": d.birthYear == null ? null : Number(d.birthYear),
            "profile.birthday.showAge": d.showAge == null ? true : Boolean(d.showAge),
            "profile.birthday.lastCelebratedYear": d.lastCelebratedYear == null ? null : Number(d.lastCelebratedYear),
            "profile.birthday.registrationMessageId": d.registrationMessageId == null ? null : String(d.registrationMessageId),
            "profile.birthday.registrationChannelId": d.registrationChannelId == null ? null : String(d.registrationChannelId),
          },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.birthdayProfiles.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }
  const customRoleDocs = await db.collection(LEGACY.customRoles).find({}, { projection: { guildId: 1, userId: 1, roleId: 1, customVocEmoji: 1, customVocChannelId: 1, customVocEligibilityLostAt: 1, customRoleEligibilityLostAt: 1, expiresAt: 1 } }).toArray();
  report.customRoles = { found: customRoleDocs.length, migrated: 0 };
  if (apply && customRoleDocs.length) {
    const ops = customRoleDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $set: {
            "profile.customRole.roleId": d.roleId == null ? null : String(d.roleId),
            "profile.customRole.customVocEmoji": d.customVocEmoji == null ? null : String(d.customVocEmoji),
            "profile.customRole.customVocChannelId": d.customVocChannelId == null ? null : String(d.customVocChannelId),
            "profile.customRole.customVocEligibilityLostAt": toDate(d.customVocEligibilityLostAt),
            "profile.customRole.customRoleEligibilityLostAt": toDate(d.customRoleEligibilityLostAt),
            "profile.customRole.expiresAt": toDate(d.expiresAt),
          },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.customRoles.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }
  const inviteDocs = await db.collection(LEGACY.inviteTracks).find({}, { projection: { guildId: 1, userId: 1, inviterId: 1, active: 1, joinedAt: 1, leftAt: 1 } }).toArray();
  report.inviteTracks = { found: inviteDocs.length, migrated: 0 };
  if (apply && inviteDocs.length) {
    const ops = inviteDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $set: {
            "profile.inviteTrack.inviterId": d.inviterId == null ? null : String(d.inviterId),
            "profile.inviteTrack.active": d.active == null ? true : Boolean(d.active),
            "profile.inviteTrack.joinedAt": toDate(d.joinedAt),
            "profile.inviteTrack.leftAt": toDate(d.leftAt),
          },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.inviteTracks.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }
  const inviteReminderDocs = await db.collection(LEGACY.inviteReminderStates).find({}, { projection: { guildId: 1, userId: 1, inviteNearTargets: 1 } }).toArray();
  report.inviteReminderStates = { found: inviteReminderDocs.length, migrated: 0 };
  if (apply && inviteReminderDocs.length) {
    const ops = inviteReminderDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $set: {
            "profile.inviteReminderState.inviteNearTargets": Array.isArray(d.inviteNearTargets)
              ? d.inviteNearTargets.map((x) => Number(x)).filter(Number.isFinite)
              : [],
          },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.inviteReminderStates.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }
  const noDmDocs = await db.collection(LEGACY.noDmPreferences).find({}, { projection: { guildId: 1, userId: 1, categories: 1 } }).toArray();
  report.noDmPreferences = { found: noDmDocs.length, migrated: 0 };
  if (apply && noDmDocs.length) {
    const ops = noDmDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $set: {
            "profile.noDmPreference.categories": Array.isArray(d.categories) ? d.categories.map((x) => String(x)) : null,
          },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.noDmPreferences.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }
  const rolePersistDocs = await db.collection(LEGACY.rolePersistUsers).find({}, { projection: { guildId: 1, userId: 1, roles: 1 } }).toArray();
  report.rolePersistUsers = { found: rolePersistDocs.length, migrated: 0 };
  if (apply && rolePersistDocs.length) {
    const ops = rolePersistDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $set: {
            "profile.rolePersist.roles": Array.isArray(d.roles) ? d.roles : [],
          },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.rolePersistUsers.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }
  const temporaryRoleDocs = await db.collection(LEGACY.temporaryRoleGrants).find({}, { projection: { guildId: 1, userId: 1, grants: 1 } }).toArray();
  report.temporaryRoleGrants = { found: temporaryRoleDocs.length, migrated: 0 };
  if (apply && temporaryRoleDocs.length) {
    const ops = temporaryRoleDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $set: {
            "profile.temporaryRoleGrants.grants": Array.isArray(d.grants) ? d.grants : [],
          },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.temporaryRoleGrants.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }
  const temporaryPermissionDocs = await db.collection(LEGACY.temporaryCommandPermissions).find({}, { projection: { guildId: 1, userId: 1, permissions: 1 } }).toArray();
  report.temporaryCommandPermissions = { found: temporaryPermissionDocs.length, migrated: 0 };
  if (apply && temporaryPermissionDocs.length) {
    const ops = temporaryPermissionDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $set: {
            "profile.temporaryCommandPermissions.permissions": Array.isArray(d.permissions) ? d.permissions : [],
          },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.temporaryCommandPermissions.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }
  const verificationDocs = await db.collection(LEGACY.verificationTenures).find({}, { projection: { guildId: 1, userId: 1, verifiedAt: 1, stage: 1 } }).toArray();
  report.verificationTenures = { found: verificationDocs.length, migrated: 0 };
  if (apply && verificationDocs.length) {
    const ops = verificationDocs.map((d) => ({
      updateOne: {
        filter: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
          $set: {
            "profile.verificationTenure.verifiedAt": toDate(d.verifiedAt),
            "profile.verificationTenure.stage": d.stage == null ? 1 : Number(d.stage),
          },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.verificationTenures.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
  }
  const oneTimeUserDocs = await db.collection(LEGACY.oneTimeReminderUsers).find({}, { projection: { userId: 1, entries: 1 } }).toArray();
  report.oneTimeReminderUsers = { found: oneTimeUserDocs.length, migrated: 0 };
  if (apply && oneTimeUserDocs.length) {
    const ops = oneTimeUserDocs.map((d) => ({
      updateOne: {
        filter: { guildId: ACTIVITY_MAIN_GUILD_ID, userId: String(d.userId || "") },
        update: {
          $setOnInsert: { guildId: ACTIVITY_MAIN_GUILD_ID, userId: String(d.userId || "") },
          $set: {
            "profile.globalOneTimeReminder.entries": Array.isArray(d.entries) ? d.entries : [],
          },
        },
        upsert: true,
      },
    }));
    const res = await profiles.bulkWrite(ops, { ordered: false });
    report.oneTimeReminderUsers.migrated = Number(res.modifiedCount || 0) + Number(res.upsertedCount || 0);
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
  mismatches = 0;
  const afkDocs = await db.collection(LEGACY.afks).find({}).toArray();
  for (const d of afkDocs) {
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { "profile.afk": 1 } });
    const s = t?.profile?.afk || {};
    if (String(s.message || "") !== String(d.message || "")) mismatches += 1;
  }
  out.afks = { total: afkDocs.length, mismatches };
  mismatches = 0;
  const mentionDocs = await db.collection(LEGACY.mentionReactions).find({}).toArray();
  for (const d of mentionDocs) {
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { "profile.mentionReaction.reactions": 1 } });
    const arr = Array.isArray(t?.profile?.mentionReaction?.reactions) ? t.profile.mentionReaction.reactions.map((x) => String(x)) : [];
    const src = Array.isArray(d.reactions) ? d.reactions.map((x) => String(x)) : [];
    if (JSON.stringify(arr) !== JSON.stringify(src)) mismatches += 1;
  }
  out.mentionReactions = { total: mentionDocs.length, mismatches };
  mismatches = 0;
  const avatarDocs = await db.collection(LEGACY.avatarPrivacies).find({}).toArray();
  for (const d of avatarDocs) {
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { "profile.privacy.avatar": 1 } });
    const s = t?.profile?.privacy?.avatar || {};
    if (Boolean(s.blocked) !== Boolean(d.blocked) || Number(s.views || 0) !== Number(d.views || 0)) mismatches += 1;
  }
  out.avatarPrivacies = { total: avatarDocs.length, mismatches };
  mismatches = 0;
  const bannerDocs = await db.collection(LEGACY.bannerPrivacies).find({}).toArray();
  for (const d of bannerDocs) {
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { "profile.privacy.banner": 1 } });
    const s = t?.profile?.privacy?.banner || {};
    if (Boolean(s.blocked) !== Boolean(d.blocked) || Number(s.views || 0) !== Number(d.views || 0)) mismatches += 1;
  }
  out.bannerPrivacies = { total: bannerDocs.length, mismatches };
  mismatches = 0;
  const quoteDocs = await db.collection(LEGACY.quotePrivacies).find({}).toArray();
  for (const d of quoteDocs) {
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { "profile.privacy.quote": 1 } });
    const s = t?.profile?.privacy?.quote || {};
    if (Boolean(s.blocked) !== Boolean(d.blocked)) mismatches += 1;
  }
  out.quotePrivacies = { total: quoteDocs.length, mismatches };
  mismatches = 0;
  const birthdayDocs = await db.collection(LEGACY.birthdayProfiles).find({}).toArray();
  for (const d of birthdayDocs) {
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { "profile.birthday": 1 } });
    const s = t?.profile?.birthday || {};
    if (Number(s.day || 0) !== Number(d.day || 0) || Number(s.month || 0) !== Number(d.month || 0) || Number(s.birthYear || 0) !== Number(d.birthYear || 0)) mismatches += 1;
  }
  out.birthdayProfiles = { total: birthdayDocs.length, mismatches };
  mismatches = 0;
  const customRoleDocs = await db.collection(LEGACY.customRoles).find({}).toArray();
  for (const d of customRoleDocs) {
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { "profile.customRole": 1 } });
    const s = t?.profile?.customRole || {};
    if (String(s.roleId || "") !== String(d.roleId || "") || String(s.customVocChannelId || "") !== String(d.customVocChannelId || "") || !sameDate(s.expiresAt, d.expiresAt)) mismatches += 1;
  }
  out.customRoles = { total: customRoleDocs.length, mismatches };
  mismatches = 0;
  const inviteDocs = await db.collection(LEGACY.inviteTracks).find({}).toArray();
  for (const d of inviteDocs) {
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { "profile.inviteTrack": 1 } });
    const s = t?.profile?.inviteTrack || {};
    if (String(s.inviterId || "") !== String(d.inviterId || "") || Boolean(s.active) !== Boolean(d.active) || !sameDate(s.joinedAt, d.joinedAt) || !sameDate(s.leftAt, d.leftAt)) mismatches += 1;
  }
  out.inviteTracks = { total: inviteDocs.length, mismatches };
  mismatches = 0;
  const inviteReminderDocs = await db.collection(LEGACY.inviteReminderStates).find({}).toArray();
  for (const d of inviteReminderDocs) {
    const t = await profiles.findOne(
      { guildId: String(d.guildId || ""), userId: String(d.userId || "") },
      { projection: { "profile.inviteReminderState.inviteNearTargets": 1 } },
    );
    const arr = Array.isArray(t?.profile?.inviteReminderState?.inviteNearTargets)
      ? t.profile.inviteReminderState.inviteNearTargets.map((x) => Number(x)).filter(Number.isFinite)
      : [];
    const src = Array.isArray(d.inviteNearTargets)
      ? d.inviteNearTargets.map((x) => Number(x)).filter(Number.isFinite)
      : [];
    if (JSON.stringify(arr) !== JSON.stringify(src)) mismatches += 1;
  }
  out.inviteReminderStates = { total: inviteReminderDocs.length, mismatches };
  mismatches = 0;
  const noDmDocs = await db.collection(LEGACY.noDmPreferences).find({}).toArray();
  for (const d of noDmDocs) {
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { "profile.noDmPreference.categories": 1 } });
    const arr = Array.isArray(t?.profile?.noDmPreference?.categories) ? t.profile.noDmPreference.categories.map((x) => String(x)) : [];
    const src = Array.isArray(d.categories) ? d.categories.map((x) => String(x)) : [];
    if (JSON.stringify(arr) !== JSON.stringify(src)) mismatches += 1;
  }
  out.noDmPreferences = { total: noDmDocs.length, mismatches };
  mismatches = 0;
  const rolePersistDocs = await db.collection(LEGACY.rolePersistUsers).find({}).toArray();
  for (const d of rolePersistDocs) {
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { "profile.rolePersist.roles": 1 } });
    const arr = Array.isArray(t?.profile?.rolePersist?.roles) ? t.profile.rolePersist.roles : [];
    const src = Array.isArray(d.roles) ? d.roles : [];
    if (JSON.stringify(arr) !== JSON.stringify(src)) mismatches += 1;
  }
  out.rolePersistUsers = { total: rolePersistDocs.length, mismatches };
  mismatches = 0;
  const temporaryRoleDocs = await db.collection(LEGACY.temporaryRoleGrants).find({}).toArray();
  for (const d of temporaryRoleDocs) {
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { "profile.temporaryRoleGrants.grants": 1 } });
    const arr = Array.isArray(t?.profile?.temporaryRoleGrants?.grants) ? t.profile.temporaryRoleGrants.grants : [];
    const src = Array.isArray(d.grants) ? d.grants : [];
    if (JSON.stringify(arr) !== JSON.stringify(src)) mismatches += 1;
  }
  out.temporaryRoleGrants = { total: temporaryRoleDocs.length, mismatches };
  mismatches = 0;
  const temporaryPermissionDocs = await db.collection(LEGACY.temporaryCommandPermissions).find({}).toArray();
  for (const d of temporaryPermissionDocs) {
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { "profile.temporaryCommandPermissions.permissions": 1 } });
    const arr = Array.isArray(t?.profile?.temporaryCommandPermissions?.permissions) ? t.profile.temporaryCommandPermissions.permissions : [];
    const src = Array.isArray(d.permissions) ? d.permissions : [];
    if (JSON.stringify(arr) !== JSON.stringify(src)) mismatches += 1;
  }
  out.temporaryCommandPermissions = { total: temporaryPermissionDocs.length, mismatches };
  mismatches = 0;
  const verificationDocs = await db.collection(LEGACY.verificationTenures).find({}).toArray();
  for (const d of verificationDocs) {
    const t = await profiles.findOne({ guildId: String(d.guildId || ""), userId: String(d.userId || "") }, { projection: { "profile.verificationTenure": 1 } });
    const s = t?.profile?.verificationTenure || {};
    if (Number(s.stage || 1) !== Number(d.stage || 1) || !sameDate(s.verifiedAt, d.verifiedAt)) mismatches += 1;
  }
  out.verificationTenures = { total: verificationDocs.length, mismatches };
  mismatches = 0;
  const oneTimeUserDocs = await db.collection(LEGACY.oneTimeReminderUsers).find({}).toArray();
  for (const d of oneTimeUserDocs) {
    const t = await profiles.findOne({ guildId: ACTIVITY_MAIN_GUILD_ID, userId: String(d.userId || "") }, { projection: { "profile.globalOneTimeReminder.entries": 1 } });
    const arr = Array.isArray(t?.profile?.globalOneTimeReminder?.entries) ? t.profile.globalOneTimeReminder.entries : [];
    const src = Array.isArray(d.entries) ? d.entries : [];
    if (JSON.stringify(arr) !== JSON.stringify(src)) mismatches += 1;
  }
  out.oneTimeReminderUsers = { total: oneTimeUserDocs.length, mismatches };

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