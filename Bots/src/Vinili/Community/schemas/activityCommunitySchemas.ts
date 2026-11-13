const mongoose = require("mongoose") as typeof import("mongoose");
const { Schema, model, models } = mongoose;
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");

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
    /** avvisi alla richiesta (una pausa al mese, limiti mezze giornate…), mostrati nella pratica sul sito */
    requisitiNonRispettati: { type: [String], default: [] },
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
        /* dove annunciarlo: all = in tutti i server in comune col bot, main = solo il principale, none = da nessuna parte */
        announceScope: { type: String, default: "all" },
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
        /* Halloween candy wallet: Mixed archivato — dati Mongo restano, niente schema attivo */
        halloween: {
          type: Schema.Types.Mixed,
          default: undefined,
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


const GlobalSettings: any = models.GlobalSettings || model("GlobalSettings", globalSettingsSchema);

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


const ActivityUserProfile: any = models.ActivityUserProfile || model("ActivityUserProfile", activityUserProfileSchema, "activityuserprofiles");
const ActivityGuildHourly: any = models.ActivityGuildHourly || model("ActivityGuildHourly", activityGuildHourlySchema, "activityguildhourlys");
const UserLeaveBackup: any = models.UserLeaveBackup || model("UserLeaveBackup", userLeaveBackupSchema, "userleavebackups");
const UserFullDiscordStateHistory: any =
  models.UserFullDiscordStateHistory ||
  model("UserFullDiscordStateHistory", userFullDiscordStateHistorySchema, "userfulldiscordstatehistories");
const ModCase = USE_LEGACY_MOD_CASE_MODEL ? (models.mod_case || model("mod_case", modCaseSchema, MOD_CASE_COLLECTION)) : null;

export = {
  ACTIVITY_MAIN_GUILD_ID,
  ACTIVITY_DAILY_STORAGE_MODE,
  ACTIVITY_HOURLY_STORAGE_MODE,
  ACTIVITY_LEGACY_DAILY_DISABLED,
  ACTIVITY_LEGACY_HOURLY_DISABLED,
  LEVEL_HISTORY_MAX_ENTRIES,
  GlobalSettings,
  InviteReminderState,
  ActivityUserProfile,
  ActivityGuildHourly,
  ModCase,
  CustomRole,
  AvatarPrivacy,
  BannerPrivacy,
  QuotePrivacy,
  RepostPrivacy,
  UserLeaveBackup,
  UserFullDiscordStateHistory,
};

