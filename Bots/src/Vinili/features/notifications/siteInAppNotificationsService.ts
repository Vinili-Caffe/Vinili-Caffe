
const { isVoteRegisteredNotification, isDedicatedInboxQueueAlert, isPuntiToltiSubjectNotif, isStaffTicketSlaNotif, isPersonalTicketOpenerNotif, isStaffTicketNotif, isStaffReviewNotif, isStaffFeedbackNotif, isWorkflowDecisionPersonalNotif, isInboxLinkedNotification, resolveNotifChannel } = require("./notifKinds") as typeof import("./notifKinds");
const { migrateLegacyInAppNotificationsForUser } = require("./notifStore") as typeof import("./notifStore");
const { invalidateUnreadCountCache, isSiteInAppNotificationStillUnread, recoverUnreadApplePushHedges, countSiteInAppUnreadForUser } = require("./notifPush") as typeof import("./notifPush");
const { removeInboxItemByDedupeKey, removeSiteInAppNotificationsMatching, removeSiteInAppNotificationsForTicket } = require("./notifRemove") as typeof import("./notifRemove");
const { enqueueSiteInAppNotification } = require("./notifEnqueue") as typeof import("./notifEnqueue");
const { deleteSiteInAppNotifications, markSiteInAppNotificationRead, markSiteInAppNotificationsReadMany, markAllSiteInAppNotificationsRead, markSiteInAppNotificationsReadForTicket } = require("./notifRead") as typeof import("./notifRead");
const { pageContextFromUrlServer, openUrlMatchesPageContextServer, markSiteInAppNotificationsReadForPage } = require("./notifPageRead") as typeof import("./notifPageRead");
const { listSiteInAppNotificationsForUser, deleteSiteInAppNotificationForUser, deleteAllSiteInAppNotificationsForUser } = require("./notifList") as typeof import("./notifList");


export = {
  isVoteRegisteredNotification,
  isDedicatedInboxQueueAlert,
  isPuntiToltiSubjectNotif,
  isStaffTicketNotif,
  isStaffTicketSlaNotif,
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
  recoverUnreadApplePushHedges,
};
/* notifUseful1 marker */