const mongoose = require("mongoose") as typeof import("mongoose");
const { Schema, model, models } = mongoose;
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");

const ACTIVITY_MAIN_GUILD_ID = String(process.env.ACTIVITY_MAIN_GUILD_ID || IDs.guilds?.main || "").trim();

/* perfResiduo1: default compact = niente nested daily/hourly sul profilo (guild hourly + counter flat). dual = legacy. */
const ACTIVITY_DAILY_STORAGE_MODE = String(process.env.ACTIVITY_DAILY_STORAGE_MODE || "compact").trim().toLowerCase();
const ACTIVITY_HOURLY_STORAGE_MODE = String(process.env.ACTIVITY_HOURLY_STORAGE_MODE || "compact").trim().toLowerCase();
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
    dmPanelMessageId: { type: String, default: null },
    mentionsMessageId: { type: String, default: null },
    colorsMessageId: { type: String, default: null },
    plusColorsMessageId: { type: String, default: null },
    infoGifMessageId: { type: String, default: null },
    infoMessageId1: { type: String, default: null },
    infoMessageId2: { type: String, default: null },
    verifyInfoMessageId: { type: String, default: null },
    verifyPanelMessageId: { type: String, default: null },
    ticketInfoMessageId: { type: String, default: null },
    ticketPanelMessageId: { type: String, default: null },
    sponsorTicketPanelMessageId: { type: String, default: null },
    pausePanelMessageId: { type: String, default: null },
    sanzioniPanelMessageId: { type: String, default: null },
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
    expEventStartAnnouncementsSent: { type: [String], default: [] },
    expLockedChannelIds: { type: [String], default: [] },
    expIgnoredRoleIds: { type: [String], default: [] },
    expRoleMultipliers: { type: Schema.Types.Mixed, default: {} },
    modConfig: { type: modConfigEmbeddedSchema, default: () => ({}) },
    personalityPanels: { type: [personalityPanelEntrySchema], default: [] },
    discordPanelRecipes: { type: Schema.Types.Mixed, default: null },
    /** Throttle sweep/backfill persistenza stato Discord utente. */
    userFullStateMaintenance: {
      lastFullBackfillAt: { type: Date, default: null },
      lastLightSweepAt: { type: Date, default: null },
    },
    channelSnapshots: { type: [channelSnapshotEntrySchema], default: [] },
    skullboardPosts: { type: [skullboardPostEntrySchema], default: [] },
        staffRosterSnapshot: { type: Schema.Types.Mixed, default: null },
    /** Ultimo holder Staffer della settimana (weekKey domenica 21 Europe/Rome). */
    stafferDellaSettimanaState: {
      userId: { type: String, default: null },
      weekKey: { type: String, default: null },
      updatedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
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

const contestFinalePendingRoleRemovalEntrySchema = new Schema(
  {
    roleId: { type: String, required: true },
    removeAt: { type: Date, required: true },
    hadRoleBefore: { type: Boolean, default: false },
    eventKey: { type: String, default: "" },
  },
  { _id: false },
);

const gringottLedgerEntrySchema = new Schema(
  {
    type: { type: String, enum: ["credit", "debit", "reward"], required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, default: 0 },
    reason: { type: String, default: "" },
    actorId: { type: String, default: null },
    source: { type: String, default: "manual" },
    rewardKey: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const staffRolesHistoryEntrySchema = new Schema(
  {
    oldRole: String,
    newRole: String,
    reason: String,
    kind: { type: String, default: null },
    date: { type: Date, default: Date.now },
        displayName: { type: String, default: null },
    username: { type: String, default: null },
    avatarUrl: { type: String, default: null },
        actorId: { type: String, default: null },
    actorName: { type: String, default: null },
    /** pexImport1: messaggio del canale #pex-depex da cui è stata importata la riga */
    importMessageId: { type: String, default: null },
  },
  { _id: false },
);
const staffTrackHistoryEntrySchema = new Schema(
  {
    kind: { type: String, default: "" },
    reason: { type: String, default: "" },
    date: { type: Date, default: Date.now },
    actorId: { type: String, default: null },
    actorName: { type: String, default: null },
    oldRole: { type: String, default: null },
    newRole: { type: String, default: null },
    entryId: { type: Number, default: null },
  },
  { _id: false },
);
const staffPartnerActionSchema = new Schema(
  {
    action: String,
    partner: String,
    invite: String,
    partnerGuildId: { type: String, default: null },
    managerId: String,
    partnershipChannelId: String,
    partnerMessageIds: { type: [String], default: [] },
    globalLogId: { type: Number, default: null },
        migrationJobId: { type: String, default: null },
    auditPenaltyDates: { type: [String], default: [] },
    auditPenaltyLogs: {
      type: [
        new Schema(
          {
            dateKey: String,
            reason: String,
            channelId: String,
            messageId: String,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
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
    /** Giorni bonus Staffer della settimana consumati su questa pausa (solo mese di grant). */
    giorniAggiuntiviSettimana: { type: Number, default: 0 },
    ruoloRichiesto: String,
    ruolo: String,
        ruoloGradeId: { type: String, default: null },
    /** pauseBothSplit1: gruppo condiviso quando la richiesta partiva da "Entrambi" */
    pauseGroupId: { type: String, default: null },
    /** pauseHalfDay1: "mattina" | "pomeriggio" = mezza giornata (dataRichiesta = dataRitorno, vale 0,5 giorni) */
    halfDay: { type: String, default: null },
    /** chiesta per lo stesso giorno */
    richiestaInGiornata: { type: Boolean, default: false },
    /** accettata in automatico dal bot (mezza giornata per oggi nei limiti) */
    autoAccepted: { type: Boolean, default: false },
    stafferInPausa: { type: Number, default: 0 },
    status: { type: String, default: "pending" },
    cancelledAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    requestChannelId: { type: String, default: null },
    requestMessageId: { type: String, default: null },
    requestMessageIdPm: { type: String, default: null },
    requestThreadId: { type: String, default: null },
  },
  { _id: true },
);
const staffAutoValutazioneSchema = new Schema(
  {
    key: { type: String, default: "" },
    type: { type: String, enum: ["positive", "negative", ""], default: "" },
    reason: { type: String, default: "" },
    channelId: { type: String, default: null },
    messageId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const staffValutazioneLogEntrySchema = new Schema(
  {
    reason: { type: String, default: "" },
    channelId: { type: String, default: null },
    messageId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    actorId: { type: String, default: null },
    actorName: { type: String, default: null },
  },
  { _id: false },
);

const staffEmbeddedSchema = new Schema(
  {
    rolesHistory: { type: [staffRolesHistoryEntrySchema], default: [] },
        trackHistory: { type: [staffTrackHistoryEntrySchema], default: [] },
    idCount: { type: Number, default: 0 },
    warnCount: { type: Number, default: 0 },
    warnReasons: { type: [String], default: [] },
    firstWarnStaffAt: { type: Date, default: null },
    positiveCount: { type: Number, default: 0 },
    negativeCount: { type: Number, default: 0 },
    positiveReasons: { type: [String], default: [] },
    negativeReasons: { type: [String], default: [] },
    positiveValutazioni: { type: [staffValutazioneLogEntrySchema], default: [] },
    negativeValutazioni: { type: [staffValutazioneLogEntrySchema], default: [] },
    valutazioniCount: { type: Number, default: 0 },
    autoValutazioni: { type: [staffAutoValutazioneSchema], default: [] },
        webTicketRatingSum: { type: Number, default: 0 },
    webTicketRatingCount: { type: Number, default: 0 },
    partnerCount: { type: Number },
    partnerRedeemSpend: { type: Number, default: 0 },
        partnerServerResetAt: { type: Date, default: null },
    managerId: { type: String },
    partnerActions: { type: [staffPartnerActionSchema] },
    partnerMilestoneDmSent: { type: [Number], default: [] },
    partnerManagerCustomPerksUntil: { type: Date, default: null },
    partnerManagerVipUntil: { type: Date, default: null },
    bestStaffPauseBonusYears: { type: [Number], default: [] },
    /** Grant settimanali: +1 giorno/settimana, spendibili nel mese del giovedì ISO della weekKey (bridge settimane a cavallo). */
    bestStaffWeekPauseBonusWeeks: {
      type: [
        new Schema(
          {
            weekKey: { type: String, default: "" },
            monthKey: { type: String, default: "" },
            days: { type: Number, default: 1 },
            grantedAt: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    valPosTradedPauseBonusDays: { type: Number, default: 0 },
    pauses: { type: [staffPauseEntrySchema], default: [] },
    serataFilmAttendanceSaturdayKey: { type: String, default: null },
    serataFilmWillAttend: { type: Boolean, default: null },
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
                regolaTimeoutStrikes: { type: Schema.Types.Mixed, default: {} },
      },
            modCases: { type: [modCaseEntrySchema], default: [] },
      postUnmuteRolesReconciledAt: { type: Date, default: null },
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
        /* wrappedExtras1: contatori Wrapped (solo forward — niente backfill storico) */
        gifsTotal: { type: Number, default: 0 },
        imagesTotal: { type: Number, default: 0 },
        mentionsMade: { type: Number, default: 0 },
        mentionsReceived: { type: Number, default: 0 },
        rolePings: { type: Number, default: 0 },
        commandsTotal: { type: Number, default: 0 },
        emojiUses: { type: Schema.Types.Mixed, default: {} },
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
            weekWinners: { type: [Number], default: [] },
            contestDisegniSecondPlaceUnlock: { type: Boolean, default: false },
            contestDisegniSecondPlaceEventKey: { type: String, default: "" },
            contestDisegniSecondPlaceAt: { type: Date, default: null },
          },
          bumpVoteRewards: {
            type: Schema.Types.Mixed,
            default: () => ({
              discadia_vote: {
                lastVoteAt: null,
                lastRemindedAt: null,
                lastVoteAtTopgg: null,
                lastRemindedAtTopgg: null,
                lastVoteAtDiscadia: null,
                lastRemindedAtDiscadia: null,
                voteCountMonthKey: "",
                voteCountTopgg: 0,
                voteCountDiscadia: 0,
                prevVoteCountMonthKey: "",
                prevVoteCountTopgg: 0,
                prevVoteCountDiscadia: 0,
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
            weeklyExp: { type: Number, default: 0 },
            weeklyKey: { type: String, default: "" },
                        prevWeekExp: { type: Number, default: 0 },
            prevWeekKey: { type: String, default: "" },
            currentStreak: { type: Number, default: 0 },
            bestStreak: { type: Number, default: 0 },
          },
          monthlyTopReward: {
            type: Schema.Types.Mixed,
            default: null,
          },
          monthlyVoteTopReward: {
            type: Schema.Types.Mixed,
            default: null,
          },
        },
      },
      supporterStatus: {
        lastMessageId: { type: String, default: null },
        lastSentAt: { type: Date, default: null },
        hasLink: { type: Boolean, default: false },
                removalDueAt: { type: Date, default: null },
      },
      countingRestoreLastDayKey: { type: String, default: null },
      countingChannelBanUntil: { type: Date, default: null },
      serverBoostAnnouncedSlotCount: { type: Number, default: null, min: 0 },
            muteRoleSnapshot: {
        roleIds: { type: [String], default: [] },
        at: { type: Date, default: null },
      },
            stanzaVoiceTotalSeconds: { type: Number, default: 0, min: 0 },
            customPerksDiscordCleanup: {
        runAt: { type: Date, default: null },
        roleId: { type: String, default: null },
        secondaryRoleId: { type: String, default: null },
        customVocChannelId: { type: String, default: null },
        customVocEmoji: { type: String, default: null },
        clearMentionReactions: { type: Boolean, default: false },
      },
      afk: {
        message: { type: String, default: null },
        timestamp: { type: Date, default: null },
        originalName: { type: String, default: null },
      },
      mentionReaction: {
        reactions: { type: [String], default: [] },
      },
      mentionResponse: {
        text: { type: String, default: "" },
        updatedAt: { type: Date, default: null },
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
        repost: {
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
        secondaryRoleId: { type: String, default: null },
        customVocEmoji: { type: String, default: null },
        customVocChannelId: { type: String, default: null },
        customVocEligibilityLostAt: { type: Date, default: null },
        customVocFailedWeekStreak: { type: Number, default: 0 },
        customVocLastEvaluatedWeekEndMs: { type: Number, default: null },
        customVocRecreationBlockedUntil: { type: Date, default: null },
        customRoleEligibilityLostAt: { type: Date, default: null },
        expiresAt: { type: Date, default: null },
      },
      /** Ruoli pannello personalità / colori / self-role (IDs Discord) — persistenza stabile. */
      personalityRoleIds: { type: [String], default: [] },
      /**
       * Snapshot completo stato Discord ricreabile post-wipe:
       * ruoli membro + fingerprint, custom role look (anche icona), custom voc + overwrites.
       */
      discordState: { type: Schema.Types.Mixed, default: null },
            contestPrizes: {
        disegniSecondPlaceUnlock: { type: Boolean, default: false },
        disegniSecondPlaceEventKey: { type: String, default: null },
        disegniSecondPlaceAt: { type: Date, default: null },
                finalePendingRoleRemovals: { type: [contestFinalePendingRoleRemovalEntrySchema], default: [] },
      },
      rankCard: {
        type: Schema.Types.Mixed,
        default: () => ({}),
      },
      inviteTrack: {
        inviterId: { type: String, default: null },
        inviteCode: { type: String, default: null },
        active: { type: Boolean, default: true },
        joinedAt: { type: Date, default: null },
        leftAt: { type: Date, default: null },
      },
      effectiveJoin: {
        firstJoinedAt: { type: Date, default: null },
        lastJoinedAt: { type: Date, default: null },
        lastLeftAt: { type: Date, default: null },
      },
      joinAnnouncePending: { type: Boolean, default: null },
      joinAnnounceSentAt: { type: Date, default: null },
      inviteReminderState: {
        inviteNearTargets: { type: [Number], default: [] },
      },
      noDmPreference: {
        categories: { type: [String], default: null },
      },
      siteNotifPrefs: {
        mutedKinds: { type: [String], default: [] },
      },
            siteChromePrefs: {
        type: Schema.Types.Mixed,
        default: () => ({}),
      },
      siteStaffCompiti: {
        type: Schema.Types.Mixed,
        default: () => ({}),
      },
      /** wordleStatsSync1: statistiche Wordle del sito per lingua { it: {...}, en: {...} } */
      siteWordleStats: {
        type: Schema.Types.Mixed,
        default: () => ({}),
      },
      /** wordleDailySync1: partita del giorno per lingua { it: SavedGame, en: SavedGame } */
      siteWordleDaily: {
        type: Schema.Types.Mixed,
        default: () => ({}),
      },
      /** Piano mensile compiti: { "YYYY-MM": { assignedAt, byWeek: { "YYYY-Www": taskId } } } */
      siteStaffCompitiPlan: {
        type: Schema.Types.Mixed,
        default: () => ({}),
      },
      /** compitiSwapSchema1: +1 scambio Staffer della settimana (prima strict dropava i campi). */
      siteStaffCompitiSwapBonus: { type: Number, default: 0 },
      siteStaffCompitiSwapBonusWeek: { type: String, default: "" },
      siteStaffCompitiSwapBonusMonth: { type: String, default: "" },
      tenantPartnership: {
        suppressManagerPing: { type: Boolean, default: false },
        ephemeralCommands: { type: Boolean, default: false },
        language: { type: String, default: "it" },
        languageManual: { type: Boolean, default: false },
        selectedBadges: { type: [String], default: [] },
        notificationsReadAt: { type: Date, default: null },
        objectivesCompleted: { type: [String], default: [] },
        objectiveStats: {
          topDailyPeriods: { type: [String], default: [] },
          topWeeklyPeriods: { type: [String], default: [] },
          topGlobalPeriods: { type: [String], default: [] },
          bugReports: { type: Number, default: 0 },
          bestGlobalRank: { type: Number, default: null },
          flags: {
            setupDone: { type: Boolean, default: false },
            descSet: { type: Boolean, default: false },
            thankYouSet: { type: Boolean, default: false },
            privacySet: { type: Boolean, default: false },
          },
          guildFlags: { type: Schema.Types.Mixed, default: {} },
        },
      },
      verificationTenure: {
        verifiedAt: { type: Date, default: null },
        stage: { type: Number, default: 1 },
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
            economy: {
        type: Schema.Types.Mixed,
        default: () => ({}),
      },
      events: {
        hogwarts: {
          retainUntil: { type: Date, default: null },
          retainEventKey: { type: String, default: "" },
          gringott: {
            eventKey: { type: String, default: "" },
            balance: { type: Number, default: 0 },
            earned: { type: Number, default: 0 },
            spent: { type: Number, default: 0 },
            ledger: { type: [gringottLedgerEntrySchema], default: [] },
            rewardKeys: { type: [String], default: [] },
          },
          shop: {
            eventKey: { type: String, default: "" },
            updatedAt: { type: Date, default: null },
            items: { type: Schema.Types.Mixed, default: () => ({}) },
          },
          shopBoostUsage: {
            type: Schema.Types.Mixed,
            default: () => ({}),
          },
                    consumableBoosts: {
            type: Schema.Types.Mixed,
            default: () => ({}),
          },
          potions: {
            type: Schema.Types.Mixed,
            default: () => ({}),
          },
          economy: {
            type: Schema.Types.Mixed,
            default: () => ({}),
          },
          duel: {
            eventKey: { type: String, default: "" },
            cooldownUntil: { type: Date, default: null },
            lastRewardAt: { type: Date, default: null },
          },
                    finaleRoleRewards: {
            type: Schema.Types.Mixed,
            default: () => ({}),
          },
        },
        halloween: {
          candy: {
            eventKey: { type: String, default: "" },
            balance: { type: Number, default: 0 },
            earned: { type: Number, default: 0 },
            owned: { type: [String], default: [] },
            updatedAt: { type: Date, default: null },
          },
        },
        /* starWarsEvent1: wallet Mixed (casse/avvento/fazione/PEI/army) — strict schema altrimenti claim 500 */
        starwars: {
          type: Schema.Types.Mixed,
          default: () => ({}),
        },
      },
    },
    staff: { type: staffEmbeddedSchema },
        staffRolesHistoryRetention: { type: [staffRolesHistoryEntrySchema], default: [] },
        /** pexImport1: pex/depex vecchi recuperati dal canale #pex-depex (solo per la cronologia in Gestione) */
        staffPexImported: { type: [staffRolesHistoryEntrySchema], default: [] },
        staffPendingPurgeAt: { type: Date, default: null },
  },
  { timestamps: true },
);
activityUserProfileSchema.index({ guildId: 1, userId: 1 }, { unique: true });
activityUserProfileSchema.index({ guildId: 1, "profile.totals.exp.totalExp": -1 });
/* siteApiW5: board indexes for weekly/messages/voice/minigames sorts */
activityUserProfileSchema.index({ guildId: 1, "profile.totals.exp.weeklyExp": -1 });
activityUserProfileSchema.index({ guildId: 1, "profile.totals.messagesTotal": -1 });
activityUserProfileSchema.index({ guildId: 1, "profile.totals.voiceTotalSeconds": -1 });
activityUserProfileSchema.index({ guildId: 1, "profile.totals.exp.minigame.totalExp": -1 });
activityUserProfileSchema.index({ guildId: 1, "profile.birthday.month": 1, "profile.birthday.day": 1 });
activityUserProfileSchema.index({ guildId: 1, "profile.inviteTrack.inviterId": 1 });
activityUserProfileSchema.index({ userId: 1, "profile.globalOneTimeReminder.entries.key": 1 });
activityUserProfileSchema.index({ "profile.globalOneTimeReminder.entries.sendAt": 1, "profile.globalOneTimeReminder.entries.sentAt": 1 });
activityUserProfileSchema.index({ guildId: 1, "profile.sponsorMainLeave.kickAt": 1 });
activityUserProfileSchema.index({ guildId: 1, "moderation.joinGateSuspicious.expiresAt": 1 });
activityUserProfileSchema.index({ guildId: 1, "moderation.modCases.caseId": 1 });
activityUserProfileSchema.index({ guildId: 1, "staff.firstWarnStaffAt": 1 });
activityUserProfileSchema.index({ guildId: 1, "staff.pauses.requestMessageId": 1 });
activityUserProfileSchema.index({ guildId: 1, staffPendingPurgeAt: 1 }, { sparse: true });
activityUserProfileSchema.index({ guildId: 1, "profile.contestPrizes.finalePendingRoleRemovals": 1 }, { sparse: true });
activityUserProfileSchema.index({ guildId: 1, "profile.events.hogwarts.finaleRoleRewards.house.expiresAt": 1 }, { sparse: true });
activityUserProfileSchema.index({ guildId: 1, "profile.events.hogwarts.finaleRoleRewards.memberTop.expiresAt": 1 }, { sparse: true });
activityUserProfileSchema.index({ "profile.muteRoleSnapshot.roleIds.0": 1 }, { sparse: true });
activityUserProfileSchema.index({ guildId: 1, "profile.customPerksDiscordCleanup.runAt": 1 }, { sparse: true });

const userLeaveBackupSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    backupDoc: { type: Schema.Types.Mixed, default: null },
    restoreRoleIds: { type: [String], default: [] },
        rejoinTrackedRoleIds: { type: [String], default: [] },
    leaveDepexMessages: {
      type: [
        new Schema(
          {
            channelId: { type: String, required: true },
            messageId: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    leftAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
userLeaveBackupSchema.index({ guildId: 1, userId: 1 }, { unique: true });
userLeaveBackupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Cronologia snapshot Discord utente (ultimo N per utente; no TTL — recovery wipe). */
const userFullDiscordStateHistorySchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    capturedAt: { type: Date, required: true, default: Date.now, index: true },
    source: { type: String, default: "unknown" },
    state: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);
userFullDiscordStateHistorySchema.index({ guildId: 1, userId: 1, capturedAt: -1 });

const activityGuildHourlySchema = new Schema(
  {
    guildId: { type: String, required: true },
    hours: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);
activityGuildHourlySchema.index({ guildId: 1 }, { unique: true, name: "activityGuildHourly_guildId_unique" });

const SITE_DOCUMENT_TYPE = Object.freeze({
  IN_APP_NOTIFICATION: "in_app_notification",
  ROLE_REQUEST_COOLDOWN: "role_request_cooldown",
  ROLE_REQUEST_PENDING: "role_request_pending",
  ROLE_GRANT_PENDING: "role_grant_pending",
  REVIEW: "review",
  SUGGESTION: "suggestion",
  BOT_FEEDBACK: "bot_feedback",
  CONFESSIONALE: "confessionale",
  PAYMENT: "payment",
  HOGWARTS_SORTING: "hogwarts_sorting",
  HOGWARTS_FORBIDDEN_BOOKS: "hogwarts_forbidden_books",
  HOGWARTS_HOUSE_POINTS: "hogwarts_house_points",
  HOGWARTS_REACT_PRESS: "hogwarts_react_press",
  HOGWARTS_EVENT_COMPLETION: "hogwarts_event_completion",
  HOGWARTS_SPELL_LIST_HUNT: "hogwarts_spell_list_hunt",
  HOGWARTS_FINALE_CHAOS: "hogwarts_finale_chaos",
  COMMUNITY_FIRST_MESSAGE_DAILY: "community_first_message_daily",
  COMMUNITY_WELCOME_GREETING_EXP: "community_welcome_greeting_exp",
  COMMUNITY_WELCOME_SESSION: "community_welcome_session",
  HOGWARTS_MINIGAME_SPAWN_WINDOW: "hogwarts_minigame_spawn_window",
  HOGWARTS_HOUSE_CHANNEL_MINIGAME_SCHEDULER: "hogwarts_house_channel_minigame_scheduler",
  HOGWARTS_SERATA_FILM_LB_PUBLISH: "hogwarts_serata_film_lb_publish",
    MINIGAME_ROLE_PING: "minigame_role_ping",
    COUNTING_RESTORE_TOKEN: "counting_restore_token",
    WEB_PUSH_SUBSCRIPTION: "web_push_subscription",
    /* pushGonePersist1: denylist FCM/WNS 410 — survvive restart site-api */
    WEB_PUSH_GONE_ENDPOINT: "web_push_gone_endpoint",
    /* pushShownAckCrossProc1: SW /push/shown survvive site-api↔bots (RAM Map era vuota) */
    WEB_PUSH_SHOWN_ACK: "web_push_shown_ack",
    STAFF_WORKFLOW: "staff_workflow",
    BOARD_LISTING: "board_listing",
    BOARD_VOTE: "board_vote",
    BOARD_BUMP: "board_bump",
    BOARD_REPORT: "board_report",
    /* boardsListingReviews1 */
    BOARD_REVIEW: "board_review",
    /* starWarsEvent1 */
    STARWARS_EVENT_STATE: "starwars_event_state",
});

const siteSuggestionCommentSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    authorName: { type: String, default: "" },
    authorAvatarUrl: { type: String, default: "" },
    /* discussionImages1: un commento può essere solo foto → testo non più obbligatorio */
    content: { type: String, default: "", trim: true, maxlength: 1200 },
    imageUrls: { type: [String], default: [] },
    parentCommentId: { type: Schema.Types.ObjectId, default: null },
    upvoterUserIds: { type: [String], default: [] },
    downvoterUserIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

const inAppNotifItemSchema = new Schema(
  {
    guildId: { type: String, default: "" },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 500 },
    notifKind: { type: String, default: "info", trim: true, maxlength: 24 },
    openUrl: { type: String, default: "", trim: true, maxlength: 400 },
    ticketId: { type: String, default: "", trim: true, maxlength: 24 },
    notifMsgCount: { type: Number, default: 1, min: 1, max: 99 },
    notifFromNames: { type: [String], default: undefined },
    dedupeKey: { type: String, default: null, trim: true, maxlength: 120 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const siteDocumentSchema = new Schema(
  {
    docType: {
      type: String,
      required: true,
      enum: Object.values(SITE_DOCUMENT_TYPE),
    },
    guildId: { type: String, default: "" },
    userId: { type: String, default: "", index: true },

        inAppNotifAggregate: { type: Boolean, default: false, index: true },
    inAppNotifItems: { type: [inAppNotifItemSchema], default: undefined },

    title: { type: String, trim: true, maxlength: 120 },
    body: { type: String, trim: true, maxlength: 500 },
    notifKind: { type: String, default: "info", trim: true, maxlength: 24 },
    openUrl: { type: String, default: "", trim: true, maxlength: 400 },
    dedupeKey: { type: String, default: null, trim: true, maxlength: 120 },
    readAt: { type: Date, default: null, index: true },

    requesterId: { type: String, default: "", index: true },
    roleId: { type: String, default: "", index: true },
    ownerId: { type: String, default: null, index: true },
    lastRequestedAt: { type: Date, default: null },
    cooldownUntil: { type: Date, default: null, index: true },
        requestToken: { type: String, default: "" },
    expiresAt: { type: Date, default: null },
    dmChannelId: { type: String, default: "", trim: true, maxlength: 32 },
    dmMessageId: { type: String, default: "", trim: true, maxlength: 32 },
    reason: { type: String, default: "", trim: true, maxlength: 500 },

    reviewKind: { type: String, default: null, trim: true, maxlength: 16 },
        contentLang: { type: String, default: null, trim: true, maxlength: 8 },
    staffUserId: { type: String, default: null, index: true },
    rating: { type: Number, min: 1, max: 5 },
    /* boardsKeepMdDraft1: descrizioni bacheca fino a 8k (prima 2k tronca/rompe md) */
    content: { type: String, trim: true, maxlength: 8000 },
    authorName: { type: String, default: "" },
    authorAvatarUrl: { type: String, default: "" },
    staffName: { type: String, default: "" },
    staffAvatarUrl: { type: String, default: "" },
    likedUserIds: { type: [String], default: [] },
    serverReplyContent: { type: String, default: "" },
    serverReplyAt: { type: Date, default: null },
    serverReplyAuthorId: { type: String, default: "" },

    status: { type: String, default: null, trim: true, maxlength: 24 },
        feedbackKind: { type: String, default: null, trim: true, maxlength: 24 },
        /* community | staff — staff board is ladder-only (excludes PM-only) */
        suggestionBoard: { type: String, default: null, trim: true, maxlength: 16 },
        confessionBoard: { type: String, default: null, trim: true, maxlength: 16 },
        /* server | staff | sito | bots | eventi | altro — eventi only for ideas */
        topicTag: { type: String, default: null, trim: true, maxlength: 16 },
        missionRewardGrantedAt: { type: Date, default: null },
        imageUrls: { type: [String], default: undefined },
    staffReason: { type: String, default: "", trim: true, maxlength: 1000 },
    decidedAt: { type: Date, default: null },
    comments: { type: [siteSuggestionCommentSchema], default: [] },
    upvoterUserIds: { type: [String], default: [] },
    downvoterUserIds: { type: [String], default: [] },

    provider: { type: String, default: "", trim: true, maxlength: 32, index: true },
    createdBy: { type: String, default: "site", trim: true, maxlength: 32 },
    planKey: { type: String, default: "", trim: true, maxlength: 80 },
    description: { type: String, default: "", trim: true, maxlength: 180 },
    amount: { type: String, default: "0.00", trim: true, maxlength: 24 },
    currency: { type: String, default: "EUR", trim: true, maxlength: 12 },
    paymentStatus: { type: String, default: "", trim: true, maxlength: 48, index: true },
    orderId: { type: String, default: "", trim: true, maxlength: 128 },
    captureId: { type: String, default: "", trim: true, maxlength: 128 },
    approveUrl: { type: String, default: "", trim: true, maxlength: 500 },
    webhookEventType: { type: String, default: "", trim: true, maxlength: 96 },
    webhookEventId: { type: String, default: "", trim: true, maxlength: 128 },
    rawOrder: { type: Schema.Types.Mixed, default: null },
    rawCapture: { type: Schema.Types.Mixed, default: null },
    rawWebhook: { type: Schema.Types.Mixed, default: null },

        houseAnnounceAt: { type: Date, default: null },
    houseAnnounceHouseId: { type: String, default: "", trim: true, maxlength: 24 },

        pushEndpoint: { type: String, default: "", trim: true, maxlength: 2048 },
    pushP256dh: { type: String, default: "", trim: true, maxlength: 512 },
    pushAuth: { type: String, default: "", trim: true, maxlength: 256 },
    pushUserAgent: { type: String, default: "", trim: true, maxlength: 300 },
    /* pushMultiDevice3: mobile|desktop|tablet|unknown — diversity prune */
    pushDeviceClass: { type: String, default: "", trim: true, maxlength: 16 },
    /* pushApplePhonePrefer1: hint client grezzo + standalone (Mac ≠ iPhone) */
    pushClientDeviceClass: { type: String, default: "", trim: true, maxlength: 16 },
    pushStandalone: { type: Boolean, default: false },

        workflowQueue: { type: String, default: "", trim: true, maxlength: 24, index: true },
    workflowKind: { type: String, default: "", trim: true, maxlength: 32 },
    workflowType: { type: String, default: "", trim: true, maxlength: 32 },
    workflowMessageId: { type: String, default: "", trim: true, maxlength: 32, index: true },
    workflowChannelId: { type: String, default: "", trim: true, maxlength: 32 },
    workflowPauseId: { type: String, default: "", trim: true, maxlength: 32, index: true },
    workflowRoleId: { type: String, default: "", trim: true, maxlength: 32 },
    workflowActionKey: { type: String, default: "", trim: true, maxlength: 48 },
        workflowWeekKey: { type: String, default: "", trim: true, maxlength: 16, index: true },
    workflowFields: { type: Schema.Types.Mixed, default: null },
    workflowDecidedBy: { type: String, default: "", trim: true, maxlength: 32 },
    workflowDecidedByName: { type: String, default: "", trim: true, maxlength: 120 },
    workflowSubjectName: { type: String, default: "", trim: true, maxlength: 120 },
    workflowSubjectAvatarUrl: { type: String, default: "", trim: true, maxlength: 512 },

    /* Vinili Boards */
    boardKind: { type: String, default: null, trim: true, maxlength: 16 },
    /* indici single-field rimossi: coperto da board_listing_* (limite 64 indici Mongo) */
    boardDiscordId: { type: String, default: "", trim: true, maxlength: 32 },
    boardSlug: { type: String, default: "", trim: true, maxlength: 80 },
    /* boardsTagline500: descrizione breve max 500 */
    boardTagline: { type: String, default: "", trim: true, maxlength: 500 },
    boardInviteUrl: { type: String, default: "", trim: true, maxlength: 500 },
    boardBotInviteUrl: { type: String, default: "", trim: true, maxlength: 500 },
    boardBannerUrl: { type: String, default: "", trim: true, maxlength: 500 },
    boardIconUrl: { type: String, default: "", trim: true, maxlength: 500 },
    boardLocale: { type: String, default: "", trim: true, maxlength: 16 },
    boardNsfw: { type: Boolean, default: false },
    boardScore: { type: Number, default: 0 },
    boardVotes30d: { type: Number, default: 0 },
    /* boardsVoteFlow1: contatore voti mese corrente (Europe/Rome) */
    boardVotesMonth: { type: Number, default: 0 },
    boardVotesMonthKey: { type: String, default: "", trim: true, maxlength: 16 },
    boardBumps7d: { type: Number, default: 0 },
    boardBumpedAt: { type: Date, default: null },
    /* boardsListingReviews1 */
    boardRatingAvg: { type: Number, default: 0 },
    boardReviewsCount: { type: Number, default: 0 },
    /* boardsVoteFlow1: reminder voto bacheca (su BOARD_VOTE) */
    boardRemindAt: { type: Date, default: null },
    boardRemindSentAt: { type: Date, default: null },
    boardAccent: { type: String, default: "", trim: true, maxlength: 32 },
    boardMarkdown: { type: String, default: "", trim: true, maxlength: 4000 },
    boardStats: { type: Schema.Types.Mixed, default: null },
    boardModeration: { type: Schema.Types.Mixed, default: null },
    boardListingId: { type: String, default: "", trim: true, maxlength: 32 },
    boardClientIpHash: { type: String, default: "", trim: true, maxlength: 80 },
    /* boardsWizard1 */
    // bug: boardTags e authorAvatar mancavano dallo schema, quindi Mongoose (strict) non li salvava mai:
    // i tag delle schede andavano persi e il filtro per tag non trovava niente
    boardTags: { type: [String], default: undefined },
    authorAvatar: { type: String, default: "" },
    boardCategories: { type: [String], default: undefined },
    boardLocales: { type: [String], default: undefined },
    boardVisitorNotes: { type: String, default: "", trim: true, maxlength: 1000 },
    boardSiteUrl: { type: String, default: "", trim: true, maxlength: 500 },
    boardSocials: { type: Schema.Types.Mixed, default: null },
    /* boardsFeatures1: Free/Paid + partnership/verify */
    boardFeatures: { type: Schema.Types.Mixed, default: null },

    /* starWarsSiteGames1: stato giochi evento (accademia/gara/miniera/…) */
    payload: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);
const SITE_DOC = SITE_DOCUMENT_TYPE;
siteDocumentSchema.index({ docType: 1, userId: 1, createdAt: -1 });
siteDocumentSchema.index({ docType: 1, userId: 1, dedupeKey: 1, createdAt: -1 });
siteDocumentSchema.index(
  { docType: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      docType: SITE_DOC.IN_APP_NOTIFICATION,
      inAppNotifAggregate: true,
    },
  },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, requesterId: 1, roleId: 1 },
  { unique: true, partialFilterExpression: { docType: SITE_DOC.ROLE_REQUEST_COOLDOWN } },
);
siteDocumentSchema.index(
  { docType: 1, requestToken: 1 },
  {
    unique: true,
    name: "site_role_pending_token_unique",
    partialFilterExpression: {
      docType: { $in: [SITE_DOC.ROLE_REQUEST_PENDING, SITE_DOC.ROLE_GRANT_PENDING] },
      requestToken: { $type: "string", $gt: "" },
    },
  },
);
siteDocumentSchema.index(
  { docType: 1, expiresAt: 1 },
  {
    name: "site_role_pending_expires",
    partialFilterExpression: {
      docType: { $in: [SITE_DOC.ROLE_REQUEST_PENDING, SITE_DOC.ROLE_GRANT_PENDING] },
    },
  },
);
siteDocumentSchema.index(
  { docType: 1, requestToken: 1 },
  { unique: true, name: "counting_restore_token_unique", partialFilterExpression: { docType: SITE_DOC.COUNTING_RESTORE_TOKEN } },
);
siteDocumentSchema.index(
  { docType: 1, pushEndpoint: 1 },
  {
    unique: true,
    name: "web_push_endpoint_unique",
    partialFilterExpression: { docType: SITE_DOC.WEB_PUSH_SUBSCRIPTION, pushEndpoint: { $type: "string", $gt: "" } },
  },
);
siteDocumentSchema.index(
  { docType: 1, userId: 1 },
  { name: "web_push_user", partialFilterExpression: { docType: SITE_DOC.WEB_PUSH_SUBSCRIPTION } },
);
siteDocumentSchema.index(
  { docType: 1, pushEndpoint: 1 },
  {
    unique: true,
    name: "web_push_gone_endpoint_unique",
    partialFilterExpression: {
      docType: SITE_DOC.WEB_PUSH_GONE_ENDPOINT,
      pushEndpoint: { $type: "string", $gt: "" },
    },
  },
);
siteDocumentSchema.index(
  { docType: 1, updatedAt: 1 },
  { name: "web_push_gone_endpoint_ttl", partialFilterExpression: { docType: SITE_DOC.WEB_PUSH_GONE_ENDPOINT } },
);
siteDocumentSchema.index(
  { docType: 1, pushEndpoint: 1 },
  {
    unique: true,
    name: "web_push_shown_ack_unique",
    partialFilterExpression: {
      docType: SITE_DOC.WEB_PUSH_SHOWN_ACK,
      pushEndpoint: { $type: "string", $gt: "" },
    },
  },
);
siteDocumentSchema.index(
  { docType: 1, updatedAt: 1 },
  { name: "web_push_shown_ack_ttl", partialFilterExpression: { docType: SITE_DOC.WEB_PUSH_SHOWN_ACK } },
);
siteDocumentSchema.index(
  { docType: 1, status: 1, expiresAt: 1 },
  { name: "counting_restore_token_sweep", partialFilterExpression: { docType: SITE_DOC.COUNTING_RESTORE_TOKEN } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, reviewKind: 1, userId: 1, staffUserId: 1 },
  { unique: true, partialFilterExpression: { docType: SITE_DOC.REVIEW } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, reviewKind: 1, updatedAt: -1, createdAt: -1 },
  { partialFilterExpression: { docType: SITE_DOC.REVIEW } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, reviewKind: 1, contentLang: 1, createdAt: -1 },
  { name: "site_bot_review_lang_created", partialFilterExpression: { docType: SITE_DOC.REVIEW, reviewKind: "bot" } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, staffUserId: 1, createdAt: -1 },
  { partialFilterExpression: { docType: SITE_DOC.REVIEW, reviewKind: "staff" } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, createdAt: -1 },
  {
    name: "site_feedback_guild_created_v2",
    partialFilterExpression: { docType: { $in: [SITE_DOC.SUGGESTION, SITE_DOC.BOT_FEEDBACK] } },
  },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, status: 1, updatedAt: -1 },
  {
    name: "site_feedback_guild_status_updated_v2",
    partialFilterExpression: { docType: { $in: [SITE_DOC.SUGGESTION, SITE_DOC.BOT_FEEDBACK] } },
  },
);
siteDocumentSchema.index(
  { docType: 1, provider: 1, orderId: 1 },
  { unique: true, partialFilterExpression: { docType: SITE_DOC.PAYMENT, orderId: { $type: "string", $gt: "" } } },
);
siteDocumentSchema.index(
  { docType: 1, provider: 1, captureId: 1 },
  { unique: true, partialFilterExpression: { docType: SITE_DOC.PAYMENT, captureId: { $type: "string", $gt: "" } } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, userId: 1, createdAt: -1 },
  { partialFilterExpression: { docType: SITE_DOC.PAYMENT } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { docType: SITE_DOC.HOGWARTS_SORTING } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, userId: 1, dedupeKey: 1 },
  { unique: true, name: "hogwarts_forbidden_books_user_event_unique", partialFilterExpression: { docType: SITE_DOC.HOGWARTS_FORBIDDEN_BOOKS } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, dedupeKey: 1 },
  { unique: true, name: "hogwarts_house_points_event_unique", partialFilterExpression: { docType: SITE_DOC.HOGWARTS_HOUSE_POINTS } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, dedupeKey: 1 },
  { unique: true, name: "hogwarts_react_press_message_unique", partialFilterExpression: { docType: SITE_DOC.HOGWARTS_REACT_PRESS } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, status: 1, createdAt: -1 },
  { name: "hogwarts_react_press_status_created", partialFilterExpression: { docType: SITE_DOC.HOGWARTS_REACT_PRESS } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, dedupeKey: 1 },
  { unique: true, name: "hogwarts_event_completion_unique", partialFilterExpression: { docType: SITE_DOC.HOGWARTS_EVENT_COMPLETION } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, dedupeKey: 1 },
  { unique: true, name: "hogwarts_spell_list_hunt_round_unique", partialFilterExpression: { docType: SITE_DOC.HOGWARTS_SPELL_LIST_HUNT } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, userId: 1, dedupeKey: 1 },
  { unique: true, name: "hogwarts_finale_chaos_unique", partialFilterExpression: { docType: SITE_DOC.HOGWARTS_FINALE_CHAOS } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, dedupeKey: 1 },
  { unique: true, name: "community_first_message_daily_unique", partialFilterExpression: { docType: SITE_DOC.COMMUNITY_FIRST_MESSAGE_DAILY } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, userId: 1, dedupeKey: 1 },
  { unique: true, name: "community_welcome_greeting_exp_unique", partialFilterExpression: { docType: SITE_DOC.COMMUNITY_WELCOME_GREETING_EXP } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, dedupeKey: 1 },
  { unique: true, name: "community_welcome_session_unique", partialFilterExpression: { docType: SITE_DOC.COMMUNITY_WELCOME_SESSION } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, dedupeKey: 1 },
  { unique: true, name: "hogwarts_minigame_spawn_window_unique", partialFilterExpression: { docType: SITE_DOC.HOGWARTS_MINIGAME_SPAWN_WINDOW } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, dedupeKey: 1 },
  { unique: true, name: "hogwarts_house_channel_minigame_scheduler_unique", partialFilterExpression: { docType: SITE_DOC.HOGWARTS_HOUSE_CHANNEL_MINIGAME_SCHEDULER } },
);
siteDocumentSchema.index(
  { docType: 1, dedupeKey: 1 },
  { unique: true, name: "minigame_role_ping_unique", partialFilterExpression: { docType: SITE_DOC.MINIGAME_ROLE_PING } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, userId: 1, dedupeKey: 1 },
  { unique: true, name: "hogwarts_serata_film_lb_publish_unique", partialFilterExpression: { docType: SITE_DOC.HOGWARTS_SERATA_FILM_LB_PUBLISH } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, dedupeKey: 1 },
  { unique: true, name: "staff_workflow_dedupe_unique", partialFilterExpression: { docType: SITE_DOC.STAFF_WORKFLOW } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, workflowQueue: 1, status: 1, createdAt: -1 },
  { name: "staff_workflow_queue_status_created", partialFilterExpression: { docType: SITE_DOC.STAFF_WORKFLOW } },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, workflowQueue: 1, workflowWeekKey: 1, createdAt: -1 },
  {
    name: "staff_workflow_resoconti_week",
    partialFilterExpression: { docType: SITE_DOC.STAFF_WORKFLOW, workflowQueue: "resoconti" },
  },
);
siteDocumentSchema.index(
  { docType: 1, guildId: 1, workflowPauseId: 1, userId: 1 },
  { name: "staff_workflow_pause_lookup", partialFilterExpression: { docType: SITE_DOC.STAFF_WORKFLOW, workflowQueue: "pause" } },
);
siteDocumentSchema.index(
  { docType: 1, status: 1, boardKind: 1, boardScore: -1, boardBumpedAt: -1 },
  { name: "board_listing_browse", partialFilterExpression: { docType: SITE_DOC.BOARD_LISTING } },
);
siteDocumentSchema.index(
  { docType: 1, boardDiscordId: 1 },
  {
    unique: true,
    name: "board_listing_discord_unique",
    partialFilterExpression: {
      docType: SITE_DOC.BOARD_LISTING,
      status: { $in: ["pending", "approved"] },
      boardDiscordId: { $type: "string", $gt: "" },
    },
  },
);
siteDocumentSchema.index(
  { docType: 1, boardSlug: 1 },
  {
    unique: true,
    name: "board_listing_slug_unique",
    partialFilterExpression: {
      docType: SITE_DOC.BOARD_LISTING,
      boardSlug: { $type: "string", $gt: "" },
    },
  },
);
siteDocumentSchema.index(
  { docType: 1, userId: 1, updatedAt: -1 },
  { name: "board_listing_owner", partialFilterExpression: { docType: SITE_DOC.BOARD_LISTING } },
);
siteDocumentSchema.index(
  { docType: 1, dedupeKey: 1 },
  {
    unique: true,
    name: "board_vote_dedupe_unique",
    partialFilterExpression: { docType: SITE_DOC.BOARD_VOTE, dedupeKey: { $type: "string", $gt: "" } },
  },
);
siteDocumentSchema.index(
  { docType: 1, boardListingId: 1, userId: 1, createdAt: -1 },
  { name: "board_bump_listing_user", partialFilterExpression: { docType: SITE_DOC.BOARD_BUMP } },
);
siteDocumentSchema.index(
  { docType: 1, boardListingId: 1, userId: 1 },
  {
    unique: true,
    name: "board_review_listing_user_unique",
    partialFilterExpression: {
      docType: SITE_DOC.BOARD_REVIEW,
      boardListingId: { $type: "string", $gt: "" },
      userId: { $type: "string", $gt: "" },
    },
  },
);
siteDocumentSchema.index(
  { docType: 1, boardListingId: 1, status: 1, createdAt: -1 },
  { name: "board_review_listing_status", partialFilterExpression: { docType: SITE_DOC.BOARD_REVIEW } },
);

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

const GlobalSettings: import("mongoose").Model<import("mongoose").InferSchemaType<typeof globalSettingsSchema>>=models.GlobalSettings||model("GlobalSettings",globalSettingsSchema);
const LegacyVerificationTenure = null;
const ReviewReward = {
  async findOne(filter?) {
    const doc = await ActivityUserProfile.findOne(filter).select("guildId userId profile.totals.exp.bumpVoteRewards.disboard_review").lean().catch(() => null);
    if (!doc?.profile?.totals?.exp?.bumpVoteRewards?.disboard_review?.rewardedAt) return null;
    return { guildId: doc.guildId, userId: doc.userId, rewardedBy: doc.profile.totals.exp.bumpVoteRewards.disboard_review.rewardedBy || null, rewardedAt: doc.profile.totals.exp.bumpVoteRewards.disboard_review.rewardedAt || null };
  },
  async create(payload: Record<string, any> = {}) {
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
function buildProfileSubdocModel({ selectPath, mapDoc, buildSet = null, clearSet = null, buildInc = null }) {
  function asQueryLike(run?) {
    return {
      lean() {
        return run();
      },
      then(resolve?, reject?) {
        return run().then(resolve, reject);
      },
      catch(reject?) {
        return run().catch(reject);
      },
    };
  }
  return {
    findOne(filter?) {
      const run = async () => {
        const doc = await ActivityUserProfile.findOne(filter).select(selectPath).lean().catch(() => null);
        return mapDoc(doc, filter) || null;
      };
      return asQueryLike(run);
    },
    find(filter: Record<string, any> = {}) {
      const run = async () => {
        const docs = await ActivityUserProfile.find(filter).select(selectPath).lean().catch(() => []);
        return docs.map((doc?) => mapDoc(doc, filter)).filter(Boolean);
      };
      return asQueryLike(run);
    },
    findOneAndUpdate(filter?, update: Record<string, any> = {}, options: Record<string, any> = {}) {
      const run = async () => {
        const setPayload = update?.$set || {};
        const setDoc = buildSet ? buildSet(setPayload) : setPayload;
        const incPayload = update?.$inc || {};
        const incDoc = typeof buildInc === "function" ? buildInc(incPayload) : {};
        const insertGuild = String(filter?.guildId || update?.$setOnInsert?.guildId || "");
        const insertUser = String(filter?.userId || update?.$setOnInsert?.userId || "");
        const mongoUpdate: Record<string, any> = {
          $setOnInsert: { guildId: insertGuild, userId: insertUser },
        };
        if (Object.keys(setDoc).length) mongoUpdate.$set = setDoc;
        if (Object.keys(incDoc).length) mongoUpdate.$inc = incDoc;
        const doc = await ActivityUserProfile.findOneAndUpdate(
          filter,
          mongoUpdate,
          { upsert: Boolean(options?.upsert), new: options?.new !== false, setDefaultsOnInsert: true },
        ).lean().catch(() => null);
        return mapDoc(doc, filter) || null;
      };
      return asQueryLike(run);
    },
    async updateOne(filter?, update: Record<string, any> = {}, options: Record<string, any> = {}) {
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
    async deleteOne(filter?) {
      const unsetDoc = clearSet || {};
      return ActivityUserProfile.updateOne(filter, { $set: unsetDoc }).catch(() => ({ modifiedCount: 0 }));
    },
    async deleteMany(filter?) {
      const unsetDoc = clearSet || {};
      return ActivityUserProfile.updateMany(filter, { $set: unsetDoc }).catch(() => ({ modifiedCount: 0 }));
    },
    async countDocuments(filter: Record<string, any> = {}) {
      return ActivityUserProfile.countDocuments(filter).catch(() => 0);
    },
  };
}
const VerificationTenure = buildProfileSubdocModel({
  selectPath: "guildId userId profile.verificationTenure",
  mapDoc: (doc?, filter?) => {
    const s = doc?.profile?.verificationTenure;
    if (!s?.verifiedAt) return null;
    return { guildId: String(doc?.guildId || filter?.guildId || ""), userId: String(doc?.userId || filter?.userId || ""), verifiedAt: s.verifiedAt, stage: Number(s.stage || 1) };
  },
  buildSet: (setPayload?) => ({
    ...(setPayload?.verifiedAt ? { "profile.verificationTenure.verifiedAt": setPayload.verifiedAt } : {}),
    ...(setPayload?.stage != null ? { "profile.verificationTenure.stage": Number(setPayload.stage) } : {}),
  }),
  clearSet: { "profile.verificationTenure.verifiedAt": null, "profile.verificationTenure.stage": 1 },
});
const InviteTrack = {
  async findOneAndUpdate(filter?, update: Record<string, any> = {}, options: Record<string, any> = {}) {
    const setPayload = update?.$set || {};
    const insertPayload = update?.$setOnInsert || {};
    return ActivityUserProfile.findOneAndUpdate(
      filter,
      {
        $setOnInsert: { guildId: String(filter?.guildId || ""), userId: String(filter?.userId || ""), ...(insertPayload?.joinedAt ? { "profile.inviteTrack.joinedAt": insertPayload.joinedAt } : {}) },
        $set: {
          ...(setPayload?.inviterId != null ? { "profile.inviteTrack.inviterId": setPayload.inviterId } : {}),
          ...(setPayload?.inviteCode != null ? { "profile.inviteTrack.inviteCode": String(setPayload.inviteCode) } : {}),
          ...(setPayload?.active != null ? { "profile.inviteTrack.active": Boolean(setPayload.active) } : {}),
          ...(Object.prototype.hasOwnProperty.call(setPayload, "leftAt") ? { "profile.inviteTrack.leftAt": setPayload.leftAt } : {}),
        },
      },
      { upsert: Boolean(options?.upsert), new: options?.new !== false, setDefaultsOnInsert: true },
    ).lean().catch(() => null);
  },
  async countDocuments(filter: Record<string, any> = {}) {
    const q = { guildId: filter?.guildId };
    if (filter?.inviterId != null) q["profile.inviteTrack.inviterId"] = filter.inviterId;
    if (filter?.active != null) q["profile.inviteTrack.active"] = Boolean(filter.active);
    return ActivityUserProfile.countDocuments(q).catch(() => 0);
  },
  async aggregate(pipeline = []) {
    const translated = pipeline.map((stage?) => {
      if (!stage?.$match) return stage;
      const m = { ...stage.$match };
      if (Object.prototype.hasOwnProperty.call(m, "inviterId")) {
        m["profile.inviteTrack.inviterId"] = m.inviterId;
        delete m.inviterId;
      }
      return { $match: m };
    }).map((stage?) => {
      if (!stage?.$group) return stage;
      const g = { ...stage.$group };
      if (g._id === "$inviterId") g._id = "$profile.inviteTrack.inviterId";
      return { $group: g };
    });
    return ActivityUserProfile.aggregate(translated).catch(() => []);
  },
  async deleteOne(filter?) {
    return ActivityUserProfile.updateOne(filter, { $set: { "profile.inviteTrack.active": false, "profile.inviteTrack.leftAt": new Date() } }).catch(() => ({ modifiedCount: 0 }));
  },
};
const InviteReminderState = {
  findOne(filter: Record<string, any> = {}) {
    const run = async () => {
      const doc = await ActivityUserProfile.findOne(filter).select("guildId userId profile.inviteReminderState").lean().catch(() => null);
      if (!doc) return null;
      return {
        guildId: String(doc.guildId || filter.guildId || ""),
        userId: String(doc.userId || filter.userId || ""),
        inviteNearTargets: Array.isArray(doc?.profile?.inviteReminderState?.inviteNearTargets)
          ? doc.profile.inviteReminderState.inviteNearTargets.map((x?) => Number(x)).filter(Number.isFinite)
          : [],
      };
    };
    const queryLike = {
      lean() {
        return run();
      },
      then(resolve?, reject?) {
        return run().then(resolve, reject);
      },
      catch(reject?) {
        return run().catch(reject);
      },
    };
    return queryLike;
  },
  async updateOne(filter: Record<string, any> = {}, update: Record<string, any> = {}, options: Record<string, any> = {}) {
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
      ops.$set["profile.inviteReminderState.inviteNearTargets"] = set.inviteNearTargets.map((x?) => Number(x)).filter(Number.isFinite);
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
  async deleteOne(filter: Record<string, any> = {}) {
    return ActivityUserProfile.updateOne(
      filter,
      { $set: { "profile.inviteReminderState.inviteNearTargets": [] } },
    ).catch(() => ({ modifiedCount: 0 }));
  },
  async deleteMany(filter: Record<string, any> = {}) {
    return ActivityUserProfile.updateMany(
      filter,
      { $set: { "profile.inviteReminderState.inviteNearTargets": [] } },
    ).catch(() => ({ modifiedCount: 0 }));
  },
  async countDocuments(filter: Record<string, any> = {}) {
    const q = { guildId: filter?.guildId, userId: filter?.userId };
    if (q.guildId == null) delete q.guildId;
    if (q.userId == null) delete q.userId;
    if (filter?.userId?.$nin) q.userId = { $nin: filter.userId.$nin };
    q["profile.inviteReminderState.inviteNearTargets.0"] = { $exists: true };
    return ActivityUserProfile.countDocuments(q).catch(() => 0);
  },
};
const CustomRole = {
  _mapFilter(filter: Record<string, any> = {}) {
    const FIELD_MAP = {
      roleId: "profile.customRole.roleId",
      secondaryRoleId: "profile.customRole.secondaryRoleId",
      customVocEmoji: "profile.customRole.customVocEmoji",
      customVocChannelId: "profile.customRole.customVocChannelId",
      customVocEligibilityLostAt: "profile.customRole.customVocEligibilityLostAt",
      customVocFailedWeekStreak: "profile.customRole.customVocFailedWeekStreak",
      customVocLastEvaluatedWeekEndMs: "profile.customRole.customVocLastEvaluatedWeekEndMs",
      customVocRecreationBlockedUntil: "profile.customRole.customVocRecreationBlockedUntil",
      customRoleEligibilityLostAt: "profile.customRole.customRoleEligibilityLostAt",
      expiresAt: "profile.customRole.expiresAt",
    };
    const walk = (node?) => {
      if (Array.isArray(node)) return node.map((item?) => walk(item));
      if (!node || typeof node !== "object") return node;
      const out: Record<string, any> = {};
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
  _pickProjectionKeys(projection?) {
    if (!projection) return [];
    if (typeof projection === "string") {
      return projection
        .split(/\s+/)
        .map((x?) => String(x || "").trim())
        .filter(Boolean)
        .filter((x?) => !x.startsWith("-"));
    }
    if (typeof projection === "object") {
      return Object.keys(projection).filter((k?) => Number(projection[k]) === 1);
    }
    return [];
  },
  findOne(filter: Record<string, any> = {}, projection = null) {
    const run = async () => {
      const doc = await ActivityUserProfile.findOne(this._mapFilter(filter)).select("_id guildId userId profile.customRole").lean().catch(() => null);
      const s = doc?.profile?.customRole;
      if (!s?.roleId && !s?.secondaryRoleId && !s?.customVocChannelId && !s?.expiresAt && !s?.customVocRecreationBlockedUntil) return null;
      const out = { _id: doc?._id || null, guildId: doc.guildId, userId: doc.userId, ...s };
      const keys = this._pickProjectionKeys(projection);
      if (!keys.length) return out;
      const picked: Record<string, any> = {};
      for (const key of keys) picked[key] = out[key];
      return picked;
    };
    const queryLike = {
      lean() {
        return run();
      },
      then(resolve?, reject?) {
        return run().then(resolve, reject);
      },
      catch(reject?) {
        return run().catch(reject);
      },
    };
    return queryLike;
  },
  find(filter: Record<string, any> = {}, projection = null) {
    let sortSpec = null;
    let limitValue = null;
    const run = async () => {
      let q = ActivityUserProfile.find(this._mapFilter(filter)).select("_id guildId userId profile.customRole");
      if (sortSpec) q = q.sort(sortSpec);
      if (Number.isFinite(limitValue) && limitValue > 0) q = q.limit(limitValue);
      const docs = await q.lean().catch(() => []);
      const mapped = docs
        .map((doc?) => ({ _id: doc?._id || null, guildId: doc.guildId, userId: doc.userId, ...(doc?.profile?.customRole || {}) }))
        .filter((x?) => x.roleId || x.secondaryRoleId || x.customVocChannelId || x.expiresAt || x.customVocRecreationBlockedUntil);
      const keys = this._pickProjectionKeys(projection);
      if (!keys.length) return mapped;
      return mapped.map((row?) => {
        const out: Record<string, any> = {};
        for (const key of keys) out[key] = row[key];
        return out;
      });
    };
    const queryLike = {
      sort(spec?) {
        sortSpec = spec;
        return queryLike;
      },
      limit(n?) {
        limitValue = Number(n);
        return queryLike;
      },
      lean() {
        return run();
      },
      then(resolve?, reject?) {
        return run().then(resolve, reject);
      },
      catch(reject?) {
        return run().catch(reject);
      },
    };
    return queryLike;
  },
  async findOneAndUpdate(filter?, update: Record<string, any> = {}, options: Record<string, any> = {}) {
    const setPayload = update?.$set || {};
    const setOnInsert = update?.$setOnInsert || {};
    const doc = await ActivityUserProfile.findOneAndUpdate(
      this._mapFilter(filter),
      {
        $setOnInsert: { guildId: String(filter?.guildId || setOnInsert?.guildId || ""), userId: String(filter?.userId || setOnInsert?.userId || "") },
        $set: {
          ...(setPayload?.roleId !== undefined ? { "profile.customRole.roleId": setPayload.roleId } : {}),
          ...(setPayload?.secondaryRoleId !== undefined ? { "profile.customRole.secondaryRoleId": setPayload.secondaryRoleId } : {}),
          ...(setPayload?.customVocEmoji !== undefined ? { "profile.customRole.customVocEmoji": setPayload.customVocEmoji } : {}),
          ...(setPayload?.customVocChannelId !== undefined ? { "profile.customRole.customVocChannelId": setPayload.customVocChannelId } : {}),
          ...(setPayload?.customVocEligibilityLostAt !== undefined ? { "profile.customRole.customVocEligibilityLostAt": setPayload.customVocEligibilityLostAt } : {}),
          ...(setPayload?.customVocFailedWeekStreak !== undefined ? { "profile.customRole.customVocFailedWeekStreak": setPayload.customVocFailedWeekStreak } : {}),
          ...(setPayload?.customVocLastEvaluatedWeekEndMs !== undefined ? { "profile.customRole.customVocLastEvaluatedWeekEndMs": setPayload.customVocLastEvaluatedWeekEndMs } : {}),
          ...(setPayload?.customVocRecreationBlockedUntil !== undefined ? { "profile.customRole.customVocRecreationBlockedUntil": setPayload.customVocRecreationBlockedUntil } : {}),
          ...(setPayload?.customRoleEligibilityLostAt !== undefined ? { "profile.customRole.customRoleEligibilityLostAt": setPayload.customRoleEligibilityLostAt } : {}),
          ...(setPayload?.expiresAt !== undefined ? { "profile.customRole.expiresAt": setPayload.expiresAt } : {}),
        },
      },
      { upsert: Boolean(options?.upsert), new: options?.new !== false, setDefaultsOnInsert: true },
    ).lean().catch(() => null);
    if (!doc) return null;
    return { guildId: doc.guildId, userId: doc.userId, ...(doc?.profile?.customRole || {}) };
  },
  async updateOne(filter?, update: Record<string, any> = {}, options: Record<string, any> = {}) {
    const setPayload = update?.$set || {};
    return ActivityUserProfile.updateOne(
      this._mapFilter(filter),
      {
        $setOnInsert: { guildId: String(filter?.guildId || ""), userId: String(filter?.userId || "") },
        $set: {
          ...(setPayload?.roleId !== undefined ? { "profile.customRole.roleId": setPayload.roleId } : {}),
          ...(setPayload?.secondaryRoleId !== undefined ? { "profile.customRole.secondaryRoleId": setPayload.secondaryRoleId } : {}),
          ...(setPayload?.customVocEmoji !== undefined ? { "profile.customRole.customVocEmoji": setPayload.customVocEmoji } : {}),
          ...(setPayload?.customVocChannelId !== undefined ? { "profile.customRole.customVocChannelId": setPayload.customVocChannelId } : {}),
          ...(setPayload?.customVocEligibilityLostAt !== undefined ? { "profile.customRole.customVocEligibilityLostAt": setPayload.customVocEligibilityLostAt } : {}),
          ...(setPayload?.customVocFailedWeekStreak !== undefined ? { "profile.customRole.customVocFailedWeekStreak": setPayload.customVocFailedWeekStreak } : {}),
          ...(setPayload?.customVocLastEvaluatedWeekEndMs !== undefined ? { "profile.customRole.customVocLastEvaluatedWeekEndMs": setPayload.customVocLastEvaluatedWeekEndMs } : {}),
          ...(setPayload?.customVocRecreationBlockedUntil !== undefined ? { "profile.customRole.customVocRecreationBlockedUntil": setPayload.customVocRecreationBlockedUntil } : {}),
          ...(setPayload?.customRoleEligibilityLostAt !== undefined ? { "profile.customRole.customRoleEligibilityLostAt": setPayload.customRoleEligibilityLostAt } : {}),
          ...(setPayload?.expiresAt !== undefined ? { "profile.customRole.expiresAt": setPayload.expiresAt } : {}),
        },
      },
      { upsert: Boolean(options?.upsert) },
    ).catch(() => ({ modifiedCount: 0 }));
  },
  async deleteOne(filter?) {
    return ActivityUserProfile.updateOne(this._mapFilter(filter), {
      $set: {
        "profile.customRole.roleId": null,
        "profile.customRole.secondaryRoleId": null,
        "profile.customRole.customVocEmoji": null,
        "profile.customRole.customVocChannelId": null,
        "profile.customRole.customVocEligibilityLostAt": null,
        "profile.customRole.customVocFailedWeekStreak": 0,
        "profile.customRole.customVocLastEvaluatedWeekEndMs": null,
        "profile.customRole.customVocRecreationBlockedUntil": null,
        "profile.customRole.customRoleEligibilityLostAt": null,
        "profile.customRole.expiresAt": null,
      },
    }).catch(() => ({ modifiedCount: 0 }));
  },
};
const AvatarPrivacy = buildProfileSubdocModel({
  selectPath: "guildId userId profile.privacy.avatar",
  mapDoc: (doc?, filter?) => ({ guildId: String(doc?.guildId || filter?.guildId || ""), userId: String(doc?.userId || filter?.userId || ""), blocked: Boolean(doc?.profile?.privacy?.avatar?.blocked), views: Number(doc?.profile?.privacy?.avatar?.views || 0) }),
  buildSet: (setPayload?) => ({
    ...(setPayload?.blocked != null ? { "profile.privacy.avatar.blocked": Boolean(setPayload.blocked) } : {}),
    ...(setPayload?.views != null ? { "profile.privacy.avatar.views": Number(setPayload.views || 0) } : {}),
  }),
  buildInc: (incPayload?) => {
    if (incPayload?.views == null) return {};
    const n = Number(incPayload.views);
    if (!Number.isFinite(n)) return {};
    return { "profile.privacy.avatar.views": n };
  },
  clearSet: { "profile.privacy.avatar.blocked": false, "profile.privacy.avatar.views": 0 },
});
const BannerPrivacy = buildProfileSubdocModel({
  selectPath: "guildId userId profile.privacy.banner",
  mapDoc: (doc?, filter?) => ({ guildId: String(doc?.guildId || filter?.guildId || ""), userId: String(doc?.userId || filter?.userId || ""), blocked: Boolean(doc?.profile?.privacy?.banner?.blocked), views: Number(doc?.profile?.privacy?.banner?.views || 0) }),
  buildSet: (setPayload?) => ({
    ...(setPayload?.blocked != null ? { "profile.privacy.banner.blocked": Boolean(setPayload.blocked) } : {}),
    ...(setPayload?.views != null ? { "profile.privacy.banner.views": Number(setPayload.views || 0) } : {}),
  }),
  buildInc: (incPayload?) => {
    if (incPayload?.views == null) return {};
    const n = Number(incPayload.views);
    if (!Number.isFinite(n)) return {};
    return { "profile.privacy.banner.views": n };
  },
  clearSet: { "profile.privacy.banner.blocked": false, "profile.privacy.banner.views": 0 },
});
const QuotePrivacy = buildProfileSubdocModel({
  selectPath: "guildId userId profile.privacy.quote",
  mapDoc: (doc?, filter?) => ({ guildId: String(doc?.guildId || filter?.guildId || ""), userId: String(doc?.userId || filter?.userId || ""), blocked: Boolean(doc?.profile?.privacy?.quote?.blocked) }),
  buildSet: (setPayload?) => ({
    ...(setPayload?.blocked != null ? { "profile.privacy.quote.blocked": Boolean(setPayload.blocked) } : {}),
  }),
  clearSet: { "profile.privacy.quote.blocked": false },
});
const RepostPrivacy = buildProfileSubdocModel({
  selectPath: "guildId userId profile.privacy.repost",
  mapDoc: (doc?, filter?) => ({ guildId: String(doc?.guildId || filter?.guildId || ""), userId: String(doc?.userId || filter?.userId || ""), blocked: Boolean(doc?.profile?.privacy?.repost?.blocked) }),
  buildSet: (setPayload?) => ({
    ...(setPayload?.blocked != null ? { "profile.privacy.repost.blocked": Boolean(setPayload.blocked) } : {}),
  }),
  clearSet: { "profile.privacy.repost.blocked": false },
});

const ActivityUserProfile: import("mongoose").Model<import("mongoose").InferSchemaType<typeof activityUserProfileSchema>> = models.ActivityUserProfile || model("ActivityUserProfile", activityUserProfileSchema, "activityuserprofiles");
const ActivityGuildHourly: import("mongoose").Model<import("mongoose").InferSchemaType<typeof activityGuildHourlySchema>> = models.ActivityGuildHourly || model("ActivityGuildHourly", activityGuildHourlySchema, "activityguildhourlys");
const UserLeaveBackup: import("mongoose").Model<import("mongoose").InferSchemaType<typeof userLeaveBackupSchema>> = models.UserLeaveBackup || model("UserLeaveBackup", userLeaveBackupSchema, "userleavebackups");
const UserFullDiscordStateHistory: import("mongoose").Model<import("mongoose").InferSchemaType<typeof userFullDiscordStateHistorySchema>> =
  models.UserFullDiscordStateHistory ||
  model("UserFullDiscordStateHistory", userFullDiscordStateHistorySchema, "userfulldiscordstatehistories");
const SiteDocument: import("mongoose").Model<import("mongoose").InferSchemaType<typeof siteDocumentSchema>> = models.SiteDocument || model("SiteDocument", siteDocumentSchema, "sitedocuments");
const ModCase = USE_LEGACY_MOD_CASE_MODEL ? (models.mod_case || model("mod_case", modCaseSchema, MOD_CASE_COLLECTION)) : null;

export = {
  ACTIVITY_MAIN_GUILD_ID,
  ACTIVITY_DAILY_STORAGE_MODE,
  ACTIVITY_HOURLY_STORAGE_MODE,
  ACTIVITY_LEGACY_DAILY_DISABLED,
  ACTIVITY_LEGACY_HOURLY_DISABLED,
  LEVEL_HISTORY_MAX_ENTRIES,
  GlobalSettings,
  VerificationTenure,
  ReviewReward,
  InviteTrack,
  InviteReminderState,
  ActivityUserProfile,
  ActivityGuildHourly,
  ModCase,
  modCaseEntrySchema,
  modCaseEditEntrySchema,
  CustomRole,
  AvatarPrivacy,
  BannerPrivacy,
  QuotePrivacy,
  RepostPrivacy,
  UserLeaveBackup,
  UserFullDiscordStateHistory,
  SiteDocument,
  SITE_DOCUMENT_TYPE,
};