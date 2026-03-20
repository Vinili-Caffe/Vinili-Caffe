const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const ACTIVITY_DAILY_STORAGE_MODE = String(process.env.ACTIVITY_DAILY_STORAGE_MODE || "dual").trim().toLowerCase();
const ACTIVITY_HOURLY_STORAGE_MODE = String(process.env.ACTIVITY_HOURLY_STORAGE_MODE || "dual").trim().toLowerCase();
const ACTIVITY_LEGACY_DAILY_DISABLED = ACTIVITY_DAILY_STORAGE_MODE === "compact";
const ACTIVITY_LEGACY_HOURLY_DISABLED = ACTIVITY_HOURLY_STORAGE_MODE === "compact";

const activityUserSchema=new Schema({guildId:{type:String,required:true},userId:{type:String,required:true,index:true},messages:{total:{type:Number,default:0},daily:{type:Number,default:0},weekly:{type:Number,default:0},dailyKey:{type:String,default:""},weeklyKey:{type:String,default:""},},voice:{totalSeconds:{type:Number,default:0},dailySeconds:{type:Number,default:0},weeklySeconds:{type:Number,default:0},dailyKey:{type:String,default:""},weeklyKey:{type:String,default:""},sessionStartedAt:{type:Date,default:null},sessionChannelId:{type:String,default:null},expAwardedSeconds:{type:Number,default:0},},},{timestamps:true},);
activityUserSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const expUserSchema=new Schema({guildId:{type:String,required:true},userId:{type:String,required:true,index:true},totalExp:{type:Number,default:0},weeklyExp:{type:Number,default:0},level:{type:Number,default:0},weeklyKey:{type:String,default:""},perkNearReminderLevels:{type:[Number],default:[]},activityExpTotal:{type:Number,default:0},},{timestamps:true},);
expUserSchema.index({ guildId: 1, userId: 1 }, { unique: true });
expUserSchema.index({ guildId: 1, totalExp: -1 });

const activityDailySchema=new Schema({guildId:{type:String,required:true,index:true},dateKey:{type:String,required:true,index:true},userId:{type:String,required:true,index:true},textCount:{type:Number,default:0},voiceSeconds:{type:Number,default:0},textChannels:{type:Map,of:Number,default:{}},voiceChannels:{type:Map,of:Number,default:{}},},{timestamps:true,autoCreate:!ACTIVITY_LEGACY_DAILY_DISABLED,autoIndex:!ACTIVITY_LEGACY_DAILY_DISABLED},);
activityDailySchema.index(
  { guildId: 1, dateKey: 1, userId: 1 },
  { unique: true },
);
const activityDailyCompactSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  dateKey: { type: String, required: true, index: true },
  users: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });
activityDailyCompactSchema.index({ guildId: 1, dateKey: 1 }, { unique: true });
activityDailyCompactSchema.index({ guildId: 1, dateKey: -1 });
activityDailyCompactSchema.index({ dateKey: -1 });

const activityHourlySchema=new Schema({guildId:{type:String,required:true,index:true},hourKey:{type:String,required:true,index:true},userId:{type:String,required:true,index:true},textCount:{type:Number,default:0},voiceSeconds:{type:Number,default:0},textChannels:{type:Map,of:Number,default:{}},voiceChannels:{type:Map,of:Number,default:{}},},{timestamps:true,autoCreate:!ACTIVITY_LEGACY_HOURLY_DISABLED,autoIndex:!ACTIVITY_LEGACY_HOURLY_DISABLED},);
activityHourlySchema.index(
  { guildId: 1, hourKey: 1, userId: 1 },
  { unique: true },
);
activityHourlySchema.index({ guildId: 1, userId: 1, hourKey: 1 });
const activityHourlyCompactSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  hourKey: { type: String, required: true, index: true },
  users: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });
activityHourlyCompactSchema.index({ guildId: 1, hourKey: 1 }, { unique: true });
activityHourlyCompactSchema.index({ guildId: 1, hourKey: -1 });
activityHourlyCompactSchema.index({ hourKey: -1 });

const levelHistorySchema=new Schema({guildId:{type:String,required:true,index:true},userId:{type:String,required:true,index:true},actorId:{type:String,default:null,index:true},action:{type:String,required:true,index:true},beforeExp:{type:Number,default:0},afterExp:{type:Number,default:0},beforeLevel:{type:Number,default:0},afterLevel:{type:Number,default:0},deltaExp:{type:Number,default:0},note:{type:String,default:null},},{timestamps:true},);
levelHistorySchema.index({ guildId: 1, userId: 1, createdAt: -1 });

const levelHistoryEntrySchema = new Schema({
  actorId: { type: String, default: null },
  action: { type: String, required: true },
  beforeExp: { type: Number, default: 0 },
  afterExp: { type: Number, default: 0 },
  beforeLevel: { type: Number, default: 0 },
  afterLevel: { type: Number, default: 0 },
  deltaExp: { type: Number, default: 0 },
  note: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, required: true },
}, { _id: false });
const LEVEL_HISTORY_MAX_ENTRIES = 150;
const levelHistoryUserSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  entries: { type: [levelHistoryEntrySchema], default: [] },
}, { timestamps: true });
levelHistoryUserSchema.index({ guildId: 1, userId: 1 }, { unique: true });
levelHistoryUserSchema.index({ guildId: 1, "entries.createdAt": -1 });

const globalSettingsSchema=new Schema({guildId:{type:String,required:true,unique:true,index:true},expMultiplier:{type:Number,default:2},expEventMultiplier:{type:Number,default:1},expEventMultiplierExpiresAt:{type:Date,default:null},expEventRoleOverrides:{type:Schema.Types.Mixed,default:null},expEventExtraMultiplierRoleIds:{type:[String],default:[]},expEventStartedAt:{type:Date,default:null},expEventEndAnnouncementSentForExpiresAt:{type:Date,default:null},staffEventExpiresAt:{type:Date,default:null},staffEventStartedAt:{type:Date,default:null},expLockedChannelIds:{type:[String],default:[]},expIgnoredRoleIds:{type:[String],default:[]},},{timestamps:true},);

const skullboardPostSchema=new Schema({guildId:{type:String,required:true},messageId:{type:String,required:true,index:true},postMessageId:{type:String,default:null},});
skullboardPostSchema.index({ guildId: 1, messageId: 1 }, { unique: true });

const personalityPanelSchema=new Schema({guildId:{type:String,required:true},channelId:{type:String,required:true},personalityMessageId:{type:String,default:null},mentionsMessageId:{type:String,default:null},colorsMessageId:{type:String,default:null},plusColorsMessageId:{type:String,default:null},infoMessageId1:{type:String,default:null},infoMessageId2:{type:String,default:null},verifyInfoMessageId:{type:String,default:null},verifyPanelMessageId:{type:String,default:null},ticketInfoMessageId:{type:String,default:null},ticketPanelMessageId:{type:String,default:null},sponsorTicketPanelMessageId:{type:String,default:null},});
personalityPanelSchema.index({ guildId: 1, channelId: 1 }, { unique: true });


const inviteReminderStateSchema=new Schema({guildId:{type:String,required:true},userId:{type:String,required:true,index:true},inviteNearTargets:{type:[Number],default:[]},},{timestamps:true},);
inviteReminderStateSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const activityEventRewardSchema=new Schema({guildId:{type:String,required:true,index:true},userId:{type:String,required:true,index:true},rewardType:{type:String,required:true,index:true},tier:{type:Number,default:null},},{timestamps:true},);
activityEventRewardSchema.index(
  { guildId: 1, userId: 1, rewardType: 1, tier: 1 },
  { unique: true },
);

const activityUserProfileRewardEntrySchema = new Schema(
  {
    rewardType: { type: String, required: true },
    tier: { type: Number, default: null },
    firstSeenAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
  },
  { _id: false },
);
const activityUserProfileLevelHistoryEntrySchema = new Schema(
  {
    actorId: { type: String, default: null },
    action: { type: String, default: "update" },
    beforeExp: { type: Number, default: 0 },
    afterExp: { type: Number, default: 0 },
    beforeLevel: { type: Number, default: 0 },
    afterLevel: { type: Number, default: 0 },
    deltaExp: { type: Number, default: 0 },
    note: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);
const activityUserProfileSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    totals: {
      messagesTotal: { type: Number, default: 0 },
      messagesDaily: { type: Number, default: 0 },
      messagesWeekly: { type: Number, default: 0 },
      messagesDailyKey: { type: String, default: "" },
      messagesWeeklyKey: { type: String, default: "" },
      voiceTotalSeconds: { type: Number, default: 0 },
      voiceDailySeconds: { type: Number, default: 0 },
      voiceWeeklySeconds: { type: Number, default: 0 },
      voiceDailyKey: { type: String, default: "" },
      voiceWeeklyKey: { type: String, default: "" },
      sessionStartedAt: { type: Date, default: null },
      sessionChannelId: { type: String, default: null },
      expAwardedSeconds: { type: Number, default: 0 },
      /** Secondi della sessione vocale aperta già riversati in daily/hourly (flush periodico + chiusura). */
      voiceActivityBucketFlushSeconds: { type: Number, default: 0 },
      /** Ultimo dateKey (Europe/Rome) aggiornato negli embedded `daily` — comodo in Compass. */
      lastEmbedDailyKey: { type: String, default: "" },
      /** Ultimo hourKey aggiornato negli embedded `hourly`. */
      lastEmbedHourlyKey: { type: String, default: "" },
    },
    daily: { type: Schema.Types.Mixed, default: {} },
    hourly: { type: Schema.Types.Mixed, default: {} },
    eventRewards: { type: [activityUserProfileRewardEntrySchema], default: [] },
    exp: {
      totalExp: { type: Number, default: 0 },
      weeklyExp: { type: Number, default: 0 },
      level: { type: Number, default: 0 },
      weeklyKey: { type: String, default: "" },
      perkNearReminderLevels: { type: [Number], default: [] },
      activityExpTotal: { type: Number, default: 0 },
      sourceUpdatedAt: { type: Date, default: null },
    },
    eventExpSnapshot: {
      totalExpAtStart: { type: Number, default: 0 },
      activityExpAtStart: { type: Number, default: 0 },
      sourceUpdatedAt: { type: Date, default: null },
    },
    eventWeekWinners: { type: [Number], default: [] },
    voteRole: {
      expiresAt: { type: Date, default: null },
      grantedAt: { type: Date, default: null },
    },
    discadiaVote: {
      lastVoteAt: { type: Date, default: null },
      lastRemindedAt: { type: Date, default: null },
      voteCount: { type: Number, default: 0 },
      voteMilestoneGranted: { type: [Number], default: [] },
      voteMilestoneNearReminded: { type: [Number], default: [] },
    },
    bumpState: {
      disboard: {
        lastBumpAt: { type: Date, default: null },
        lastBumpUserId: { type: String, default: null },
        reminderSentAt: { type: Date, default: null },
      },
      discadia: {
        lastBumpAt: { type: Date, default: null },
        lastBumpUserId: { type: String, default: null },
        reminderSentAt: { type: Date, default: null },
      },
    },
    bumpVoteRewards: { type: Schema.Types.Mixed, default: {} },
    minigame: {
      totalExp: { type: Number, default: 0 },
      currentStreak: { type: Number, default: 0 },
      bestStreak: { type: Number, default: 0 },
    },
    supporterStatus: {
      lastMessageId: { type: String, default: null },
      lastSentAt: { type: Date, default: null },
      hasLink: { type: Boolean, default: false },
    },
    reviewReward: {
      rewardedBy: { type: String, default: null },
      rewardedAt: { type: Date, default: null },
    },
    profile: {
      afk: {
        message: { type: String, default: null },
        timestamp: { type: Date, default: null },
        originalName: { type: String, default: null },
      },
      mentionReaction: {
        reactions: { type: [String], default: [] },
      },
      privacy: {
        avatar: {
          blocked: { type: Boolean, default: false },
          views: { type: Number, default: 0 },
        },
        banner: {
          blocked: { type: Boolean, default: false },
          views: { type: Number, default: 0 },
        },
        quote: {
          blocked: { type: Boolean, default: false },
        },
      },
      birthday: {
        day: { type: Number, default: null },
        month: { type: Number, default: null },
        birthYear: { type: Number, default: null },
        showAge: { type: Boolean, default: true },
        lastCelebratedYear: { type: Number, default: null },
        registrationMessageId: { type: String, default: null },
        registrationChannelId: { type: String, default: null },
      },
      customRole: {
        roleId: { type: String, default: null },
        customVocEmoji: { type: String, default: null },
        customVocChannelId: { type: String, default: null },
        customVocEligibilityLostAt: { type: Date, default: null },
        customRoleEligibilityLostAt: { type: Date, default: null },
        expiresAt: { type: Date, default: null },
      },
      inviteTrack: {
        inviterId: { type: String, default: null },
        active: { type: Boolean, default: true },
        joinedAt: { type: Date, default: null },
        leftAt: { type: Date, default: null },
      },
      noDmPreference: {
        categories: { type: [String], default: null },
      },
      verificationTenure: {
        verifiedAt: { type: Date, default: null },
        stage: { type: Number, default: 1 },
      },
      rolePersist: {
        roles: { type: [Schema.Types.Mixed], default: [] },
      },
      temporaryRoleGrants: {
        grants: { type: [Schema.Types.Mixed], default: [] },
      },
      temporaryCommandPermissions: {
        permissions: { type: [Schema.Types.Mixed], default: [] },
      },
      globalOneTimeReminder: {
        entries: { type: [Schema.Types.Mixed], default: [] },
      },
    },
    levelHistory: { type: [activityUserProfileLevelHistoryEntrySchema], default: [] },
  },
  { timestamps: true },
);
activityUserProfileSchema.index({ guildId: 1, userId: 1 }, { unique: true });
activityUserProfileSchema.index({ guildId: 1, "eventRewards.rewardType": 1 });
activityUserProfileSchema.index({ guildId: 1, "exp.totalExp": -1 });
activityUserProfileSchema.index({ guildId: 1, "profile.birthday.month": 1, "profile.birthday.day": 1 });
activityUserProfileSchema.index({ guildId: 1, "profile.inviteTrack.inviterId": 1 });
activityUserProfileSchema.index({ "profile.temporaryRoleGrants.grants.expiresAt": 1 });
activityUserProfileSchema.index({ "profile.temporaryCommandPermissions.permissions.expiresAt": 1 });
activityUserProfileSchema.index({ userId: 1, "profile.globalOneTimeReminder.entries.key": 1 });
activityUserProfileSchema.index({ "profile.globalOneTimeReminder.entries.sendAt": 1, "profile.globalOneTimeReminder.entries.sentAt": 1 });

const eventUserExpSnapshotSchema=new Schema({guildId:{type:String,required:true,index:true},userId:{type:String,required:true,index:true},totalExpAtStart:{type:Number,default:0},activityExpAtStart:{type:Number,default:0},},{timestamps:true},);
eventUserExpSnapshotSchema.index({ guildId: 1, userId: 1 }, { unique: true });

/** Vincitori settimana evento 2 o 3: permesso ad personam permanente (equivalente Level50/Level70) senza ruolo. Nessuna scadenza: i vincitori mantengono per sempre l’accesso a +customrole, +customvoc, ecc. */
const eventWeekWinnerSchema=new Schema({guildId:{type:String,required:true,index:true},userId:{type:String,required:true,index:true},week:{type:Number,required:true},},{timestamps:true},);
eventWeekWinnerSchema.index({ guildId: 1, userId: 1, week: 1 }, { unique: true });

const channelSnapshotSchema=new Schema({guildId:{type:String,required:true,index:true},channelId:{type:String,required:true,index:true},name:{type:String,default:""},type:{type:Number,default:null},parentId:{type:String,default:null},deletedAt:{type:Date,default:null,index:true},},{timestamps:true},);
channelSnapshotSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

const GlobalSettings=models.GlobalSettings||model("GlobalSettings",globalSettingsSchema);
const LegacyVerificationTenure = null;
const SkullboardPost=models.SkullboardPost||model("SkullboardPost",skullboardPostSchema);
const ReviewReward = {
  async findOne(filter) {
    const doc = await ActivityUserProfile.findOne(filter).select("guildId userId reviewReward").lean().catch(() => null);
    if (!doc?.reviewReward?.rewardedAt) return null;
    return { guildId: doc.guildId, userId: doc.userId, rewardedBy: doc.reviewReward.rewardedBy || null, rewardedAt: doc.reviewReward.rewardedAt || null };
  },
  async create(payload = {}) {
    return ActivityUserProfile.findOneAndUpdate(
      { guildId: String(payload.guildId || ""), userId: String(payload.userId || "") },
      {
        $setOnInsert: { guildId: String(payload.guildId || ""), userId: String(payload.userId || "") },
        $set: {
          "reviewReward.rewardedBy": payload.rewardedBy ? String(payload.rewardedBy) : null,
          "reviewReward.rewardedAt": payload.rewardedAt ? new Date(payload.rewardedAt) : new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => null);
  },
};
const PersonalityPanel=models.PersonalityPanel||model("PersonalityPanel",personalityPanelSchema);
const LegacyInviteTrack = null;
const InviteReminderState=models.InviteReminderState||model("InviteReminderState",inviteReminderStateSchema);
function buildProfileSubdocModel({ selectPath, mapDoc, buildSet = null, clearSet = null }) {
  return {
    async findOne(filter) {
      const doc = await ActivityUserProfile.findOne(filter).select(selectPath).lean().catch(() => null);
      return mapDoc(doc, filter) || null;
    },
    async find(filter = {}) {
      const docs = await ActivityUserProfile.find(filter).select(selectPath).lean().catch(() => []);
      return docs.map((doc) => mapDoc(doc, filter)).filter(Boolean);
    },
    async findOneAndUpdate(filter, update = {}, options = {}) {
      const setPayload = update?.$set || {};
      const setDoc = buildSet ? buildSet(setPayload) : setPayload;
      const doc = await ActivityUserProfile.findOneAndUpdate(
        filter,
        {
          $setOnInsert: { guildId: String(filter?.guildId || ""), userId: String(filter?.userId || "") },
          $set: setDoc,
        },
        { upsert: Boolean(options?.upsert), new: options?.new !== false, setDefaultsOnInsert: true },
      ).lean().catch(() => null);
      return mapDoc(doc, filter) || null;
    },
    async updateOne(filter, update = {}, options = {}) {
      const setPayload = update?.$set || {};
      const setDoc = buildSet ? buildSet(setPayload) : setPayload;
      return ActivityUserProfile.updateOne(
        filter,
        {
          $setOnInsert: { guildId: String(filter?.guildId || ""), userId: String(filter?.userId || "") },
          $set: setDoc,
        },
        { upsert: Boolean(options?.upsert) },
      ).catch(() => ({ modifiedCount: 0 }));
    },
    async deleteOne(filter) {
      const unsetDoc = clearSet || {};
      return ActivityUserProfile.updateOne(filter, { $set: unsetDoc }).catch(() => ({ modifiedCount: 0 }));
    },
    async deleteMany(filter) {
      const unsetDoc = clearSet || {};
      return ActivityUserProfile.updateMany(filter, { $set: unsetDoc }).catch(() => ({ modifiedCount: 0 }));
    },
    async countDocuments(filter = {}) {
      return ActivityUserProfile.countDocuments(filter).catch(() => 0);
    },
  };
}
const VerificationTenure = buildProfileSubdocModel({
  selectPath: "guildId userId profile.verificationTenure",
  mapDoc: (doc, filter) => {
    const s = doc?.profile?.verificationTenure;
    if (!s?.verifiedAt) return null;
    return { guildId: String(doc?.guildId || filter?.guildId || ""), userId: String(doc?.userId || filter?.userId || ""), verifiedAt: s.verifiedAt, stage: Number(s.stage || 1) };
  },
  buildSet: (setPayload) => ({
    ...(setPayload?.verifiedAt ? { "profile.verificationTenure.verifiedAt": setPayload.verifiedAt } : {}),
    ...(setPayload?.stage != null ? { "profile.verificationTenure.stage": Number(setPayload.stage) } : {}),
  }),
  clearSet: { "profile.verificationTenure.verifiedAt": null, "profile.verificationTenure.stage": 1 },
});
const InviteTrack = {
  async findOneAndUpdate(filter, update = {}, options = {}) {
    const setPayload = update?.$set || {};
    const insertPayload = update?.$setOnInsert || {};
    return ActivityUserProfile.findOneAndUpdate(
      filter,
      {
        $setOnInsert: { guildId: String(filter?.guildId || ""), userId: String(filter?.userId || ""), ...(insertPayload?.joinedAt ? { "profile.inviteTrack.joinedAt": insertPayload.joinedAt } : {}) },
        $set: {
          ...(setPayload?.inviterId != null ? { "profile.inviteTrack.inviterId": setPayload.inviterId } : {}),
          ...(setPayload?.active != null ? { "profile.inviteTrack.active": Boolean(setPayload.active) } : {}),
          ...(Object.prototype.hasOwnProperty.call(setPayload, "leftAt") ? { "profile.inviteTrack.leftAt": setPayload.leftAt } : {}),
        },
      },
      { upsert: Boolean(options?.upsert), new: options?.new !== false, setDefaultsOnInsert: true },
    ).lean().catch(() => null);
  },
  async countDocuments(filter = {}) {
    const q = { guildId: filter?.guildId };
    if (filter?.inviterId != null) q["profile.inviteTrack.inviterId"] = filter.inviterId;
    if (filter?.active != null) q["profile.inviteTrack.active"] = Boolean(filter.active);
    return ActivityUserProfile.countDocuments(q).catch(() => 0);
  },
  async aggregate(pipeline = []) {
    const translated = pipeline.map((stage) => {
      if (!stage?.$match) return stage;
      const m = { ...stage.$match };
      if (Object.prototype.hasOwnProperty.call(m, "inviterId")) {
        m["profile.inviteTrack.inviterId"] = m.inviterId;
        delete m.inviterId;
      }
      return { $match: m };
    }).map((stage) => {
      if (!stage?.$group) return stage;
      const g = { ...stage.$group };
      if (g._id === "$inviterId") g._id = "$profile.inviteTrack.inviterId";
      return { $group: g };
    });
    return ActivityUserProfile.aggregate(translated).catch(() => []);
  },
  async deleteOne(filter) {
    return ActivityUserProfile.updateOne(filter, { $set: { "profile.inviteTrack.active": false, "profile.inviteTrack.leftAt": new Date() } }).catch(() => ({ modifiedCount: 0 }));
  },
};
const CustomRole = {
  async findOne(filter) {
    const doc = await ActivityUserProfile.findOne(filter).select("guildId userId profile.customRole").lean().catch(() => null);
    const s = doc?.profile?.customRole;
    if (!s?.roleId && !s?.customVocChannelId && !s?.expiresAt) return null;
    return { guildId: doc.guildId, userId: doc.userId, ...s };
  },
  async find(filter = {}) {
    const docs = await ActivityUserProfile.find(filter).select("guildId userId profile.customRole").lean().catch(() => []);
    return docs
      .map((doc) => ({ guildId: doc.guildId, userId: doc.userId, ...(doc?.profile?.customRole || {}) }))
      .filter((x) => x.roleId || x.customVocChannelId || x.expiresAt);
  },
  async findOneAndUpdate(filter, update = {}, options = {}) {
    const setPayload = update?.$set || {};
    const setOnInsert = update?.$setOnInsert || {};
    const doc = await ActivityUserProfile.findOneAndUpdate(
      filter,
      {
        $setOnInsert: { guildId: String(filter?.guildId || setOnInsert?.guildId || ""), userId: String(filter?.userId || setOnInsert?.userId || "") },
        $set: {
          ...(setPayload?.roleId !== undefined ? { "profile.customRole.roleId": setPayload.roleId } : {}),
          ...(setPayload?.customVocEmoji !== undefined ? { "profile.customRole.customVocEmoji": setPayload.customVocEmoji } : {}),
          ...(setPayload?.customVocChannelId !== undefined ? { "profile.customRole.customVocChannelId": setPayload.customVocChannelId } : {}),
          ...(setPayload?.customVocEligibilityLostAt !== undefined ? { "profile.customRole.customVocEligibilityLostAt": setPayload.customVocEligibilityLostAt } : {}),
          ...(setPayload?.customRoleEligibilityLostAt !== undefined ? { "profile.customRole.customRoleEligibilityLostAt": setPayload.customRoleEligibilityLostAt } : {}),
          ...(setPayload?.expiresAt !== undefined ? { "profile.customRole.expiresAt": setPayload.expiresAt } : {}),
        },
      },
      { upsert: Boolean(options?.upsert), new: options?.new !== false, setDefaultsOnInsert: true },
    ).lean().catch(() => null);
    if (!doc) return null;
    return { guildId: doc.guildId, userId: doc.userId, ...(doc?.profile?.customRole || {}) };
  },
  async updateOne(filter, update = {}, options = {}) {
    const setPayload = update?.$set || {};
    return ActivityUserProfile.updateOne(
      filter,
      {
        $setOnInsert: { guildId: String(filter?.guildId || ""), userId: String(filter?.userId || "") },
        $set: {
          ...(setPayload?.roleId !== undefined ? { "profile.customRole.roleId": setPayload.roleId } : {}),
          ...(setPayload?.customVocEmoji !== undefined ? { "profile.customRole.customVocEmoji": setPayload.customVocEmoji } : {}),
          ...(setPayload?.customVocChannelId !== undefined ? { "profile.customRole.customVocChannelId": setPayload.customVocChannelId } : {}),
          ...(setPayload?.customVocEligibilityLostAt !== undefined ? { "profile.customRole.customVocEligibilityLostAt": setPayload.customVocEligibilityLostAt } : {}),
          ...(setPayload?.customRoleEligibilityLostAt !== undefined ? { "profile.customRole.customRoleEligibilityLostAt": setPayload.customRoleEligibilityLostAt } : {}),
          ...(setPayload?.expiresAt !== undefined ? { "profile.customRole.expiresAt": setPayload.expiresAt } : {}),
        },
      },
      { upsert: Boolean(options?.upsert) },
    ).catch(() => ({ modifiedCount: 0 }));
  },
  async deleteOne(filter) {
    return ActivityUserProfile.updateOne(filter, {
      $set: {
        "profile.customRole.roleId": null,
        "profile.customRole.customVocEmoji": null,
        "profile.customRole.customVocChannelId": null,
        "profile.customRole.customVocEligibilityLostAt": null,
        "profile.customRole.customRoleEligibilityLostAt": null,
        "profile.customRole.expiresAt": null,
      },
    }).catch(() => ({ modifiedCount: 0 }));
  },
};
const AvatarPrivacy = buildProfileSubdocModel({
  selectPath: "guildId userId profile.privacy.avatar",
  mapDoc: (doc, filter) => ({ guildId: String(doc?.guildId || filter?.guildId || ""), userId: String(doc?.userId || filter?.userId || ""), blocked: Boolean(doc?.profile?.privacy?.avatar?.blocked), views: Number(doc?.profile?.privacy?.avatar?.views || 0) }),
  buildSet: (setPayload) => ({
    ...(setPayload?.blocked != null ? { "profile.privacy.avatar.blocked": Boolean(setPayload.blocked) } : {}),
    ...(setPayload?.views != null ? { "profile.privacy.avatar.views": Number(setPayload.views || 0) } : {}),
  }),
  clearSet: { "profile.privacy.avatar.blocked": false, "profile.privacy.avatar.views": 0 },
});
const BannerPrivacy = buildProfileSubdocModel({
  selectPath: "guildId userId profile.privacy.banner",
  mapDoc: (doc, filter) => ({ guildId: String(doc?.guildId || filter?.guildId || ""), userId: String(doc?.userId || filter?.userId || ""), blocked: Boolean(doc?.profile?.privacy?.banner?.blocked), views: Number(doc?.profile?.privacy?.banner?.views || 0) }),
  buildSet: (setPayload) => ({
    ...(setPayload?.blocked != null ? { "profile.privacy.banner.blocked": Boolean(setPayload.blocked) } : {}),
    ...(setPayload?.views != null ? { "profile.privacy.banner.views": Number(setPayload.views || 0) } : {}),
  }),
  clearSet: { "profile.privacy.banner.blocked": false, "profile.privacy.banner.views": 0 },
});
const QuotePrivacy = buildProfileSubdocModel({
  selectPath: "guildId userId profile.privacy.quote",
  mapDoc: (doc, filter) => ({ guildId: String(doc?.guildId || filter?.guildId || ""), userId: String(doc?.userId || filter?.userId || ""), blocked: Boolean(doc?.profile?.privacy?.quote?.blocked) }),
  buildSet: (setPayload) => ({
    ...(setPayload?.blocked != null ? { "profile.privacy.quote.blocked": Boolean(setPayload.blocked) } : {}),
  }),
  clearSet: { "profile.privacy.quote.blocked": false },
});
const ChannelSnapshot=models.ChannelSnapshot||model("ChannelSnapshot",channelSnapshotSchema);
const ActivityUserProfile = models.ActivityUserProfile || model("ActivityUserProfile", activityUserProfileSchema, "activityuserprofiles");
module.exports = {
  LEVEL_HISTORY_MAX_ENTRIES,
  GlobalSettings,
  VerificationTenure,
  SkullboardPost,
  ReviewReward,
  PersonalityPanel,
  InviteTrack,
  InviteReminderState,
  ActivityUserProfile,
  CustomRole,
  AvatarPrivacy,
  BannerPrivacy,
  QuotePrivacy,
  ChannelSnapshot,
};