const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;
const IDs = require("../../Utils/Config/ids");

/**
 * Guild principale: un solo documento `activityuserprofiles` per (guildId, userId).
 * Automod, sponsor leave e `profile.globalOneTimeReminder` vivono sullo stesso doc del resto (exp, totals, ecc.).
 * Override: env `ACTIVITY_MAIN_GUILD_ID` (es. istanza di test).
 */
const ACTIVITY_MAIN_GUILD_ID = String(process.env.ACTIVITY_MAIN_GUILD_ID || IDs.guilds?.main || "").trim();

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

const modConfigEmbeddedSchema = new Schema(
  {
    logChannelId: { type: String, default: null },
    dmOnAction: { type: Boolean, default: true },
    caseCounter: { type: Number, default: 0 },
    exemptRoles: { type: [String], default: [] },
    exemptChannels: { type: [String], default: [] },
  },
  { _id: false },
);
const personalityPanelEntrySchema = new Schema(
  {
    channelId: { type: String, required: true },
    personalityMessageId: { type: String, default: null },
    mentionsMessageId: { type: String, default: null },
    colorsMessageId: { type: String, default: null },
    plusColorsMessageId: { type: String, default: null },
    infoMessageId1: { type: String, default: null },
    infoMessageId2: { type: String, default: null },
    verifyInfoMessageId: { type: String, default: null },
    verifyPanelMessageId: { type: String, default: null },
    ticketInfoMessageId: { type: String, default: null },
    ticketPanelMessageId: { type: String, default: null },
    sponsorTicketPanelMessageId: { type: String, default: null },
  },
  { _id: false },
);
const channelSnapshotEntrySchema = new Schema(
  {
    channelId: { type: String, required: true },
    name: { type: String, default: "" },
    type: { type: Number, default: null },
    parentId: { type: String, default: null },
    deletedAt: { type: Date, default: null },
  },
  { _id: false },
);
const skullboardPostEntrySchema = new Schema(
  {
    messageId: { type: String, required: true },
    postMessageId: { type: String, default: null },
  },
  { _id: false },
);

const modCaseEditEntrySchema = new Schema(
  {
    field: { type: String, required: true },
    previous: { type: String, default: "" },
    next: { type: String, default: "" },
    editedBy: { type: String, default: null },
    editedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const modCaseEntrySchema = new Schema(
  {
    caseId: { type: Number, required: true },
    action: { type: String, required: true },
    userId: { type: String, required: true },
    modId: { type: String, required: true },
    reason: { type: String, default: "Nessun motivo fornito" },
    durationMs: { type: Number, default: null },
    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    context: {
      channelId: { type: String, default: null },
      messageId: { type: String, default: null },
    },
    edits: { type: [modCaseEditEntrySchema], default: [] },
    closedAt: { type: Date, default: null },
    closeReason: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);
const globalSettingsSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    expMultiplier: { type: Number, default: 2 },
    expEventMultiplier: { type: Number, default: 1 },
    expEventMultiplierExpiresAt: { type: Date, default: null },
    expEventRoleOverrides: { type: Schema.Types.Mixed, default: null },
    expEventExtraMultiplierRoleIds: { type: [String], default: [] },
    expEventStartedAt: { type: Date, default: null },
    expEventEndAnnouncementSentForExpiresAt: { type: Date, default: null },
    staffEventExpiresAt: { type: Date, default: null },
    staffEventStartedAt: { type: Date, default: null },
    expLockedChannelIds: { type: [String], default: [] },
    expIgnoredRoleIds: { type: [String], default: [] },
    modConfig: { type: modConfigEmbeddedSchema, default: () => ({}) },
    personalityPanels: { type: [personalityPanelEntrySchema], default: [] },
    channelSnapshots: { type: [channelSnapshotEntrySchema], default: [] },
    skullboardPosts: { type: [skullboardPostEntrySchema], default: [] },
  },
  { timestamps: true },
);

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

const staffRolesHistoryEntrySchema = new Schema(
  {
    oldRole: String,
    newRole: String,
    reason: String,
    date: { type: Date, default: Date.now },
  },
  { _id: false },
);
const staffPartnerActionSchema = new Schema(
  {
    action: String,
    partner: String,
    invite: String,
    managerId: String,
    partnershipChannelId: String,
    partnerMessageIds: { type: [String], default: [] },
    auditPenaltyDates: { type: [String], default: [] },
    date: { type: Date, default: Date.now },
  },
  { _id: true },
);
const staffPauseEntrySchema = new Schema(
  {
    dataRichiesta: String,
    dataRitorno: String,
    motivazione: String,
    giorniUsati: { type: Number, default: 0 },
    giorniAggiuntivi: { type: Number, default: 0 },
    ruolo: String,
    stafferInPausa: { type: Number, default: 0 },
    status: { type: String, default: "pending" },
    cancelledAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    requestChannelId: { type: String, default: null },
    requestMessageId: { type: String, default: null },
    requestThreadId: { type: String, default: null },
  },
  { _id: true },
);
const staffEventEmbeddedSchema = new Schema(
  {
    points: { type: Number, default: 0 },
    weeklyRewards: { type: [Number], default: [] },
    rewardGivenTypes: { type: [String], default: [] },
  },
  { _id: false },
);
/** Ex-dedicated `Staff` collection: dati staff/PM/pause/event incastonati nel profilo activity. */
const staffEmbeddedSchema = new Schema(
  {
    rolesHistory: { type: [staffRolesHistoryEntrySchema], default: [] },
    idCount: { type: Number, default: 0 },
    warnCount: { type: Number, default: 0 },
    warnReasons: { type: [String], default: [] },
    firstWarnStaffAt: { type: Date, default: null },
    positiveCount: { type: Number, default: 0 },
    negativeCount: { type: Number, default: 0 },
    positiveReasons: { type: [String], default: [] },
    negativeReasons: { type: [String], default: [] },
    valutazioniCount: { type: Number, default: 0 },
    partnerCount: { type: Number },
    managerId: { type: String },
    partnerActions: { type: [staffPartnerActionSchema] },
    pauses: { type: [staffPauseEntrySchema], default: [] },
    staffEvent: { type: staffEventEmbeddedSchema, default: () => ({}) },
  },
  { _id: false },
);

const activityUserProfileSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
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
    moderation: {
      joinGateSuspicious: {
        source: { type: String, default: "joingate" },
        reason: { type: String, default: "" },
        markedAt: { type: Date, default: null },
        expiresAt: { type: Date, default: null },
      },
      automodBadUser: {
        totalTriggers: { type: Number, default: 0 },
        warnPoints: { type: Number, default: 0 },
        activeStrikes: { type: Number, default: 0 },
        timeoutActions: { type: Number, default: 0 },
        lastTriggerAt: { type: Date, default: null },
        lastActionAt: { type: Date, default: null },
        lastGuildId: { type: String, default: null },
        lastHeat: { type: Number, default: 0 },
        lastAction: { type: String, default: null },
        activeStrikeReasons: { type: [String], default: [] },
        reasons: { type: [String], default: [] },
      },
      /** Storico case compact. */
      modCases: { type: [modCaseEntrySchema], default: [] },
    },
    profile: {
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
        voiceActivityBucketFlushSeconds: { type: Number, default: 0 },
        voiceDisconnectCount: { type: Number, default: 0 },
        lastEmbedDailyKey: { type: String, default: "" },
        lastEmbedHourlyKey: { type: String, default: "" },
        daily: { type: Schema.Types.Mixed, default: {} },
        hourly: { type: Schema.Types.Mixed, default: {} },
        exp: {
          totalExp: { type: Number, default: 0 },
          weeklyExp: { type: Number, default: 0 },
          level: { type: Number, default: 0 },
          weeklyKey: { type: String, default: "" },
          perkNearReminderLevels: { type: [Number], default: [] },
          activityExpTotal: { type: Number, default: 0 },
          sourceUpdatedAt: { type: Date, default: null },
          levelHistory: { type: [activityUserProfileLevelHistoryEntrySchema], default: [] },
          event: {
            rewards: { type: [activityUserProfileRewardEntrySchema], default: [] },
            snapshot: {
              totalExpAtStart: { type: Number, default: 0 },
              activityExpAtStart: { type: Number, default: 0 },
              sourceUpdatedAt: { type: Date, default: null },
            },
            weekWinners: { type: [Number], default: [] },
          },
          bumpVoteRewards: {
            type: Schema.Types.Mixed,
            default: () => ({
              discadia_vote: {
                lastVoteAt: null,
                lastRemindedAt: null,
                voteCount: 0,
                pendingVotes: [],
                voteRole: {
                  expiresAt: null,
                  grantedAt: null,
                },
              },
              disboard_review: {
                rewardedBy: null,
                rewardedAt: null,
              },
            }),
          },
          minigame: {
            totalExp: { type: Number, default: 0 },
            currentStreak: { type: Number, default: 0 },
            bestStreak: { type: Number, default: 0 },
          },
        },
      },
      supporterStatus: {
        lastMessageId: { type: String, default: null },
        lastSentAt: { type: Date, default: null },
        hasLink: { type: Boolean, default: false },
      },
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
      inviteReminderState: {
        inviteNearTargets: { type: [Number], default: [] },
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
      sponsorMainLeave: {
        leftAt: { type: Date, default: null },
        kickAt: { type: Date, default: null },
        dmSent: { type: Boolean, default: false },
        dmFailed: { type: Boolean, default: false },
      },
    },
    staff: { type: staffEmbeddedSchema },
  },
  { timestamps: true },
);
activityUserProfileSchema.index({ guildId: 1, userId: 1 }, { unique: true });
activityUserProfileSchema.index({ guildId: 1, "profile.totals.exp.event.rewards.rewardType": 1 });
activityUserProfileSchema.index({ guildId: 1, "profile.totals.exp.totalExp": -1 });
activityUserProfileSchema.index({ guildId: 1, "profile.birthday.month": 1, "profile.birthday.day": 1 });
activityUserProfileSchema.index({ guildId: 1, "profile.inviteTrack.inviterId": 1 });
activityUserProfileSchema.index({ "profile.temporaryRoleGrants.grants.expiresAt": 1 });
activityUserProfileSchema.index({ "profile.temporaryCommandPermissions.permissions.expiresAt": 1 });
activityUserProfileSchema.index({ userId: 1, "profile.globalOneTimeReminder.entries.key": 1 });
activityUserProfileSchema.index({ "profile.globalOneTimeReminder.entries.sendAt": 1, "profile.globalOneTimeReminder.entries.sentAt": 1 });
activityUserProfileSchema.index({ guildId: 1, "profile.sponsorMainLeave.kickAt": 1 });
activityUserProfileSchema.index({ guildId: 1, "moderation.joinGateSuspicious.expiresAt": 1 });
activityUserProfileSchema.index({ guildId: 1, "moderation.modCases.caseId": 1 });
activityUserProfileSchema.index({ guildId: 1, "staff.staffEvent.points": -1 });
activityUserProfileSchema.index({ guildId: 1, "staff.firstWarnStaffAt": 1 });
activityUserProfileSchema.index({ guildId: 1, "staff.pauses.requestMessageId": 1 });

const userLeaveBackupSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    backupDoc: { type: Schema.Types.Mixed, default: null },
    leftAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
userLeaveBackupSchema.index({ guildId: 1, userId: 1 }, { unique: true });
userLeaveBackupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const eventUserExpSnapshotSchema=new Schema({guildId:{type:String,required:true,index:true},userId:{type:String,required:true,index:true},totalExpAtStart:{type:Number,default:0},activityExpAtStart:{type:Number,default:0},},{timestamps:true},);
eventUserExpSnapshotSchema.index({ guildId: 1, userId: 1 }, { unique: true });

/** Vincitori settimana evento 2 o 3: permesso ad personam permanente (equivalente Level50/Level70) senza ruolo. Nessuna scadenza: i vincitori mantengono per sempre l’accesso a +profile, +profile, ecc. */
const eventWeekWinnerSchema=new Schema({guildId:{type:String,required:true,index:true},userId:{type:String,required:true,index:true},week:{type:Number,required:true},},{timestamps:true},);
eventWeekWinnerSchema.index({ guildId: 1, userId: 1, week: 1 }, { unique: true });

const MOD_CASE_COLLECTION = process.env.MOD_CASE_COLLECTION ? String(process.env.MOD_CASE_COLLECTION).trim() : "mod_case";
const MOD_CASE_STORAGE_MODE = String(process.env.MOD_CASE_STORAGE_MODE || "compact").trim().toLowerCase();
const USE_LEGACY_MOD_CASE_MODEL = MOD_CASE_STORAGE_MODE === "legacy" || MOD_CASE_STORAGE_MODE === "dual";
const modCaseSchema = new Schema(
  {
    guildId: { type: String, required: true },
    caseId: { type: Number, required: true, index: true },
    action: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    modId: { type: String, required: true },
    reason: { type: String, default: "Nessun motivo fornito" },
    durationMs: { type: Number, default: null },
    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    context: {
      channelId: { type: String, default: null },
      messageId: { type: String, default: null },
    },
    edits: { type: [modCaseEditEntrySchema], default: [] },
    closedAt: { type: Date, default: null },
    closeReason: { type: String, default: null },
  },
  { timestamps: true, autoCreate: false },
);
modCaseSchema.index({ guildId: 1, caseId: 1 }, { unique: true });
modCaseSchema.index({ guildId: 1, userId: 1, createdAt: -1 });
modCaseSchema.index({ guildId: 1, modId: 1, createdAt: -1 });
modCaseSchema.index({ guildId: 1, action: 1, active: 1, expiresAt: 1 });

const GlobalSettings=models.GlobalSettings||model("GlobalSettings",globalSettingsSchema);
const LegacyVerificationTenure = null;
const ReviewReward = {
  async findOne(filter) {
    const doc = await ActivityUserProfile.findOne(filter).select("guildId userId profile.totals.exp.bumpVoteRewards.disboard_review").lean().catch(() => null);
    if (!doc?.profile?.totals?.exp?.bumpVoteRewards?.disboard_review?.rewardedAt) return null;
    return { guildId: doc.guildId, userId: doc.userId, rewardedBy: doc.profile.totals.exp.bumpVoteRewards.disboard_review.rewardedBy || null, rewardedAt: doc.profile.totals.exp.bumpVoteRewards.disboard_review.rewardedAt || null };
  },
  async create(payload = {}) {
    return ActivityUserProfile.findOneAndUpdate(
      { guildId: String(payload.guildId || ""), userId: String(payload.userId || "") },
      {
        $setOnInsert: { guildId: String(payload.guildId || ""), userId: String(payload.userId || "") },
        $set: {
          "profile.totals.exp.bumpVoteRewards.disboard_review.rewardedBy": payload.rewardedBy ? String(payload.rewardedBy) : null,
          "profile.totals.exp.bumpVoteRewards.disboard_review.rewardedAt": payload.rewardedAt ? new Date(payload.rewardedAt) : new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => null);
  },
};
const LegacyInviteTrack = null;
function buildProfileSubdocModel({ selectPath, mapDoc, buildSet = null, clearSet = null }) {
  function asQueryLike(run) {
    return {
      lean() {
        return run();
      },
      then(resolve, reject) {
        return run().then(resolve, reject);
      },
      catch(reject) {
        return run().catch(reject);
      },
    };
  }
  return {
    findOne(filter) {
      const run = async () => {
        const doc = await ActivityUserProfile.findOne(filter).select(selectPath).lean().catch(() => null);
        return mapDoc(doc, filter) || null;
      };
      return asQueryLike(run);
    },
    find(filter = {}) {
      const run = async () => {
        const docs = await ActivityUserProfile.find(filter).select(selectPath).lean().catch(() => []);
        return docs.map((doc) => mapDoc(doc, filter)).filter(Boolean);
      };
      return asQueryLike(run);
    },
    findOneAndUpdate(filter, update = {}, options = {}) {
      const run = async () => {
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
      };
      return asQueryLike(run);
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
const InviteReminderState = {
  findOne(filter = {}) {
    const run = async () => {
      const doc = await ActivityUserProfile.findOne(filter).select("guildId userId profile.inviteReminderState").lean().catch(() => null);
      if (!doc) return null;
      return {
        guildId: String(doc.guildId || filter.guildId || ""),
        userId: String(doc.userId || filter.userId || ""),
        inviteNearTargets: Array.isArray(doc?.profile?.inviteReminderState?.inviteNearTargets)
          ? doc.profile.inviteReminderState.inviteNearTargets.map((x) => Number(x)).filter(Number.isFinite)
          : [],
      };
    };
    const queryLike = {
      lean() {
        return run();
      },
      then(resolve, reject) {
        return run().then(resolve, reject);
      },
      catch(reject) {
        return run().catch(reject);
      },
    };
    return queryLike;
  },
  async updateOne(filter = {}, update = {}, options = {}) {
    const addToSet = update?.$addToSet || {};
    const set = update?.$set || {};
    const ops = {
      $setOnInsert: {
        guildId: String(filter?.guildId || ""),
        userId: String(filter?.userId || ""),
      },
      $set: {},
    };
    if (Array.isArray(set?.inviteNearTargets)) {
      ops.$set["profile.inviteReminderState.inviteNearTargets"] = set.inviteNearTargets.map((x) => Number(x)).filter(Number.isFinite);
    }
    if (addToSet?.inviteNearTargets != null) {
      return ActivityUserProfile.updateOne(
        filter,
        {
          ...ops,
          $addToSet: {
            "profile.inviteReminderState.inviteNearTargets": Number(addToSet.inviteNearTargets),
          },
        },
        { upsert: Boolean(options?.upsert) },
      ).catch(() => ({ modifiedCount: 0 }));
    }
    return ActivityUserProfile.updateOne(
      filter,
      ops,
      { upsert: Boolean(options?.upsert) },
    ).catch(() => ({ modifiedCount: 0 }));
  },
  async deleteOne(filter = {}) {
    return ActivityUserProfile.updateOne(
      filter,
      { $set: { "profile.inviteReminderState.inviteNearTargets": [] } },
    ).catch(() => ({ modifiedCount: 0 }));
  },
  async deleteMany(filter = {}) {
    return ActivityUserProfile.updateMany(
      filter,
      { $set: { "profile.inviteReminderState.inviteNearTargets": [] } },
    ).catch(() => ({ modifiedCount: 0 }));
  },
  async countDocuments(filter = {}) {
    const q = { guildId: filter?.guildId, userId: filter?.userId };
    if (q.guildId == null) delete q.guildId;
    if (q.userId == null) delete q.userId;
    if (filter?.userId?.$nin) q.userId = { $nin: filter.userId.$nin };
    q["profile.inviteReminderState.inviteNearTargets.0"] = { $exists: true };
    return ActivityUserProfile.countDocuments(q).catch(() => 0);
  },
};
const CustomRole = {
  _mapFilter(filter = {}) {
    const FIELD_MAP = {
      roleId: "profile.customRole.roleId",
      customVocEmoji: "profile.customRole.customVocEmoji",
      customVocChannelId: "profile.customRole.customVocChannelId",
      customVocEligibilityLostAt: "profile.customRole.customVocEligibilityLostAt",
      customRoleEligibilityLostAt: "profile.customRole.customRoleEligibilityLostAt",
      expiresAt: "profile.customRole.expiresAt",
    };
    const walk = (node) => {
      if (Array.isArray(node)) return node.map((item) => walk(item));
      if (!node || typeof node !== "object") return node;
      const out = {};
      for (const [key, value] of Object.entries(node)) {
        if (key.startsWith("$")) {
          out[key] = walk(value);
          continue;
        }
        const mappedKey = FIELD_MAP[key] || key;
        out[mappedKey] = walk(value);
      }
      return out;
    };
    return walk(filter);
  },
  findOne(filter = {}, projection = null) {
    const run = async () => {
      const doc = await ActivityUserProfile.findOne(this._mapFilter(filter)).select("_id guildId userId profile.customRole").lean().catch(() => null);
      const s = doc?.profile?.customRole;
      if (!s?.roleId && !s?.customVocChannelId && !s?.expiresAt) return null;
      const out = { _id: doc?._id || null, guildId: doc.guildId, userId: doc.userId, ...s };
      if (!projection || typeof projection !== "object") return out;
      const keys = Object.keys(projection).filter((k) => Number(projection[k]) === 1);
      if (!keys.length) return out;
      const picked = {};
      for (const key of keys) picked[key] = out[key];
      return picked;
    };
    const queryLike = {
      lean() {
        return run();
      },
      then(resolve, reject) {
        return run().then(resolve, reject);
      },
      catch(reject) {
        return run().catch(reject);
      },
    };
    return queryLike;
  },
  find(filter = {}, projection = null) {
    let sortSpec = null;
    let limitValue = null;
    const run = async () => {
      let q = ActivityUserProfile.find(this._mapFilter(filter)).select("_id guildId userId profile.customRole");
      if (sortSpec) q = q.sort(sortSpec);
      if (Number.isFinite(limitValue) && limitValue > 0) q = q.limit(limitValue);
      const docs = await q.lean().catch(() => []);
      const mapped = docs
        .map((doc) => ({ _id: doc?._id || null, guildId: doc.guildId, userId: doc.userId, ...(doc?.profile?.customRole || {}) }))
        .filter((x) => x.roleId || x.customVocChannelId || x.expiresAt);
      if (!projection || typeof projection !== "object") return mapped;
      const keys = Object.keys(projection).filter((k) => Number(projection[k]) === 1);
      if (!keys.length) return mapped;
      return mapped.map((row) => {
        const out = {};
        for (const key of keys) out[key] = row[key];
        return out;
      });
    };
    const queryLike = {
      sort(spec) {
        sortSpec = spec;
        return queryLike;
      },
      limit(n) {
        limitValue = Number(n);
        return queryLike;
      },
      lean() {
        return run();
      },
      then(resolve, reject) {
        return run().then(resolve, reject);
      },
      catch(reject) {
        return run().catch(reject);
      },
    };
    return queryLike;
  },
  async findOneAndUpdate(filter, update = {}, options = {}) {
    const setPayload = update?.$set || {};
    const setOnInsert = update?.$setOnInsert || {};
    const doc = await ActivityUserProfile.findOneAndUpdate(
      this._mapFilter(filter),
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
      this._mapFilter(filter),
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
    return ActivityUserProfile.updateOne(this._mapFilter(filter), {
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

const ActivityUserProfile = models.ActivityUserProfile || model("ActivityUserProfile", activityUserProfileSchema, "activityuserprofiles");
const UserLeaveBackup = models.UserLeaveBackup || model("UserLeaveBackup", userLeaveBackupSchema, "userleavebackups");
const ModCase = USE_LEGACY_MOD_CASE_MODEL ? (models.mod_case || model("mod_case", modCaseSchema, MOD_CASE_COLLECTION)) : null;

module.exports = {
  ACTIVITY_MAIN_GUILD_ID,
  LEVEL_HISTORY_MAX_ENTRIES,
  GlobalSettings,
  VerificationTenure,
  ReviewReward,
  InviteTrack,
  InviteReminderState,
  ActivityUserProfile,
  ModCase,
  modCaseEntrySchema,
  modCaseEditEntrySchema,
  CustomRole,
  AvatarPrivacy,
  BannerPrivacy,
  QuotePrivacy,
  UserLeaveBackup,
};