const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const mongoose = require("mongoose") as typeof import("mongoose");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { shouldSkipSiteInAppNotif, buildSkipContext, isKindMuted, KIND_TO_GROUP } = require("../../Web/siteNotifPrefs") as typeof import("../../Web/siteNotifPrefs");
const { normalizeUserId, normalizeKind, isVoteRegisteredNotification, isDedicatedInboxQueueAlert, isPuntiToltiSubjectNotif, isStaffTicketSlaNotif, isMentionNotif, isPersonalTicketOpenerNotif, isStaffTicketNotif, isStaffReviewNotif, isStaffFeedbackNotif, isWorkflowDecisionPersonalNotif, isInboxLinkedNotification, resolveNotifChannel } = require("./notifKinds") as typeof import("./notifKinds");
const { TICKET_ID_RE, normalizeTicketId, entityIdFromHashToken, ticketIdFromOpenUrl, inboxItemMatchesTicket, mergeNotifFromNames, buildCollapsedTicketChatCopy, buildCollapsedDigestCopy } = require("./notifCopy") as typeof import("./notifCopy");
const { NOTIF, MAX_PER_USER, DEDUPE_KEY_MAX, legacyFlatQuery, inboxQuery, mergeItemsSortTrim, migrateLegacyInAppNotificationsForUser, itemMatchesDedupeWindow, pushInboxItemAtomic } = require("./notifStore") as typeof import("./notifStore");
const { listCache, listInflight, invalidateUnreadCountCache, fireNotifDismissPush, broadcastInboxChanged, clearMobilePushSoftRetries, isSiteInAppNotificationStillUnread, clearPushRetriesForInboxItem, scheduleMobilePushSoftRetries, recoverUnreadApplePushHedges, fireNotificationPush, countSiteInAppUnreadForUser } = require("./notifPush") as typeof import("./notifPush");
const { replaceInboxItemByDedupeKey, removeInboxItemByDedupeKey, removeSiteInAppNotificationsMatching, removeSiteInAppNotificationsForTicket } = require("./notifRemove") as typeof import("./notifRemove");
const { enqueueSiteInAppNotification, pruneSiteInAppNotificationsForUser } = require("./notifEnqueue") as typeof import("./notifEnqueue");
const { deleteSiteInAppNotifications, isValidNotificationId, markSiteInAppNotificationRead, markSiteInAppNotificationsReadMany, markAllSiteInAppNotificationsRead, markSiteInAppNotificationsReadForTicket } = require("./notifRead") as typeof import("./notifRead");
const { pageContextFromUrlServer, openUrlMatchesPageContextServer, markSiteInAppNotificationsReadForPage } = require("./notifPageRead") as typeof import("./notifPageRead");
const { listSiteInAppNotificationsForUser, deleteSiteInAppNotificationForUser, deleteAllSiteInAppNotificationsForUser } = require("./notifList") as typeof import("./notifList");


export = {
  isVoteRegisteredNotification,
  isDedicatedInboxQueueAlert,
  isPuntiToltiSubjectNotif,
  isStaffTicketNotif,
  isStaffTicketSlaNotif,
  isMentionNotif,
  isPersonalTicketOpenerNotif,
  isWorkflowDecisionPersonalNotif,
  isStaffReviewNotif,
  isStaffFeedbackNotif,
  isInboxLinkedNotification,
  resolveNotifChannel,
  enqueueSiteInAppNotification,
  removeInboxItemByDedupeKey,
  removeSiteInAppNotificationsForTicket,
  removeSiteInAppNotificationsMatching,
  listSiteInAppNotificationsForUser,
  countSiteInAppUnreadForUser,
  invalidateUnreadCountCache,
  pruneSiteInAppNotificationsForUser,
  deleteSiteInAppNotifications,
  deleteAllSiteInAppNotificationsForUser,
  deleteSiteInAppNotificationForUser,
  markSiteInAppNotificationRead,
  markSiteInAppNotificationsReadMany,
  markAllSiteInAppNotificationsRead,
  markSiteInAppNotificationsReadForTicket,
  markSiteInAppNotificationsReadForPage,
  pageContextFromUrlServer,
  openUrlMatchesPageContextServer,
  migrateLegacyInAppNotificationsForUser,
  isSiteInAppNotificationStillUnread,
  clearMobilePushSoftRetries,
  scheduleMobilePushSoftRetries,
  recoverUnreadApplePushHedges,
};
/* notifUseful1 marker */