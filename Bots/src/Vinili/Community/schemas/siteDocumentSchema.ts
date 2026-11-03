const mongoose = require("mongoose") as typeof import("mongoose");
const { Schema, model, models } = mongoose;

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

const SiteDocument: any = models.SiteDocument || model("SiteDocument", siteDocumentSchema, "sitedocuments");

export = {
  SITE_DOCUMENT_TYPE,
  SiteDocument,
};

