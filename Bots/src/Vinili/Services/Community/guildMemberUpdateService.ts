
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { didStaffMembershipChange, didStaffListDisplayRolesChange, memberHasStaffRole } = require("../../Utils/Community/staffListUtils") as typeof import("../../Utils/Community/staffListUtils");
const { memberHasPartnerManagerRole, memberHasAnyStaffPresenceForDepexSync, buildStaffPartnerManagerIdUnsetUpdate } = require("../../Utils/Staff/staffPmUtils") as typeof import("../../Utils/Staff/staffPmUtils");
const { deleteStaffPauseRequestChannelMessages, deleteStaffRelatedMessagesFromConfiguredChannels, archiveStaffRolesHistoryThenUnsetStaff } = require("../../Utils/Staff/staffDocUtils") as typeof import("../../Utils/Staff/staffDocUtils");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { grantBestStaffPauseBonusYear, scheduleAcceptedPauseMessagesRefreshAfterRankChange, getMemberStaffRankRoleId } = require("../../Utils/Pause/pauseHandlersUtils") as typeof import("../../Utils/Pause/pauseHandlersUtils");
const { onStafferDellaSettimanaRoleAdded } = require("../Staff/stafferDellaSettimanaService") as typeof import("../Staff/stafferDellaSettimanaService");
const { setWelcomeContextActive } = require("../../Utils/Message/officialMessageCommunityHandlers") as typeof import("../../Utils/Message/officialMessageCommunityHandlers");
const { syncClanTagRolesForUserEverywhereAfterMemberEvent } = require("./clanTagRoleService") as typeof import("./clanTagRoleService");
const { syncPersistentAutoValutazioniForMember, handleStaffBoostAutoValutazioneMemberUpdate, resolveAutoValutazioneCreateKeysFromMemberUpdate } = require("../Staff/staffAutoValutazioniService") as typeof import("../Staff/staffAutoValutazioniService");
const { handleMainGuildMemberUpdate } = require("../Staff/staffAccessMirrorService") as typeof import("../Staff/staffAccessMirrorService");
const { shouldSendPublicMemberAnnouncement } = require("../../Utils/Community/memberPublicAnnouncementGate") as typeof import("../../Utils/Community/memberPublicAnnouncementGate");
const { runDeferredJoinAnnouncements } = require("../../Events/guildMemberAdd") as typeof import("../../Events/guildMemberAdd");
const { handlePreMemberRoleOnMemberUpdate } = require("../../Utils/Community/preMemberRoleService") as typeof import("../../Utils/Community/preMemberRoleService");
const { syncStaffChatThreadsForMemberChange } = require("../Staff/staffChatThreadsService") as typeof import("../Staff/staffChatThreadsService");
const { syncStaffCmdsThreadsForMemberChange } = require("../Staff/staffCmdsThreadsService") as typeof import("../Staff/staffCmdsThreadsService");
const { autoUnclaimOpenTicketsClaimedByUser } = require("../../features/tickets/discord/ticketAutoUnclaimOnStaffLoss") as typeof import("../../features/tickets/discord/ticketAutoUnclaimOnStaffLoss");
const { syncMutedMirrorRoleFromMemberUpdate, memberIsInMuteMirrorState, shouldSuppressStaffDepexForMuteMirror } = require("../Moderation/mutedMirrorRoleService") as typeof import("../Moderation/mutedMirrorRoleService");
const { maybeAnnounceDonationPackageInSupporters } = require("../../Utils/Community/donationPackageSupportersAnnounce") as typeof import("../../Utils/Community/donationPackageSupportersAnnounce");
const { maybeAnnounceManualSocialRolesAndGrantPicPermsBundle } = require("../../Utils/Community/manualSocialRoleAnnounceAndPicPerms") as typeof import("../../Utils/Community/manualSocialRoleAnnounceAndPicPerms");
const { maybeSyncPatronRoleForMember } = require("../../Utils/Community/patronRoleService") as typeof import("../../Utils/Community/patronRoleService");
const { upsertVerifiedMember, applyTenureForMember } = require("./communityOpsService") as typeof import("./communityOpsService");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope") as typeof import("../../MultiGuild/core/guildFeatureScope");
const { nativeBoostSystemKind, nativeBoostSeenSince, resolveBoosterUserIdFromBoostContent, countRecentBotBoostAnnouncesForUser, resolveBoostSlotTarget, parseNativeBoostSlotCount, mergeNativeBoostSlotEvents } = require("./boostAnnounceState") as typeof import("./boostAnnounceState");
const { noteNativeBoostSeen, handleNativeBoostSystemMessage, channelIdIsBoostNativeRecoveryTarget, countNativeBoostSlotsInRecentMessages } = require("./boostNative") as typeof import("./boostNative");
const { sendMemberUpdateLog, sendMemberRoleUpdateLog } = require("./memberUpdateLogs") as typeof import("./memberUpdateLogs");
const { enforceJoinGatePostJoinUsername } = require("./joinGateUsername") as typeof import("./joinGateUsername");
const { recordManualStaffRoleHistoryIfNeeded, removePlusColorsIfNotEligible, ensureCustomVocAccess, syncCustomVocEligibilityWindow, syncCustomRoleEligibilityWindow } = require("./memberPerks") as typeof import("./memberPerks");
const { computeBoostDelta, handleBoostUpdate, recoverConcurrentNativeBoosts, recoverMissingBoostEmbedsForUser } = require("./boostAnnounce") as typeof import("./boostAnnounce");
const { recoverLastGlobalNativeBoostEmbedsOnStartup, recoverRecentBoostEmbedsOnStartup } = require("./boostRecovery") as typeof import("./boostRecovery");
const { correctMisleadingSingleBoostEmbedsOnStartup, backfillAnnouncedBoostSlotsFromSupportersHistory, reconcileDoubleBoosterRolesOnStartup, recoverMissingSecondBoostEmbedsOnStartup, recoverUnannouncedBoostersOnStartup } = require("./boostStartupFixes") as typeof import("./boostStartupFixes");



const BOOST_CHANNEL_EMBED_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

export = {
  name: "guildMemberUpdate",
  channelIdIsBoostNativeRecoveryTarget,
  handleNativeBoostSystemMessage,
  recoverMissingBoostEmbedsForUser,
  recoverConcurrentNativeBoosts,
  recoverLastGlobalNativeBoostEmbedsOnStartup,
  recoverRecentBoostEmbedsOnStartup,
  correctMisleadingSingleBoostEmbedsOnStartup,
  backfillAnnouncedBoostSlotsFromSupportersHistory,
  reconcileDoubleBoosterRolesOnStartup,
  recoverMissingSecondBoostEmbedsOnStartup,
  recoverUnannouncedBoostersOnStartup,
  countNativeBoostSlotsInRecentMessages,
  countRecentBotBoostAnnouncesForUser,
  __test: {
    resolveBoostSlotTarget,
    noteNativeBoostSeen,
    nativeBoostSeenSince,
    resolveBoosterUserIdFromBoostContent,
    parseNativeBoostSlotCount,
    computeBoostDelta,
    mergeNativeBoostSlotEvents,
    nativeBoostSystemKind,
  },
  async execute(oldMember?, newMember?, client?) {
    try {
      if (!oldMember || !newMember?.guild || !newMember?.user) return;
      if (!isViniliFullFeatureGuild(newMember.guild.id)) return;
      if (String(newMember.guild.id) === String(IDs.guilds?.main || "")) {
        await handlePreMemberRoleOnMemberUpdate(oldMember, newMember).catch((err?) => {
          global.logger?.warn?.("[guildMemberUpdate] preMember role:", newMember.id, err?.message || err);
        });
        const memberRoleId = String(IDs.roles?.Member || "").trim();
        if (
          memberRoleId &&
          !newMember.user?.bot &&
          !oldMember.roles.cache.has(memberRoleId) &&
          newMember.roles.cache.has(memberRoleId)
        ) {
          try {
            const record = await upsertVerifiedMember(newMember.guild.id, newMember.id, new Date());
            await applyTenureForMember(newMember, record);
          } catch (err) {
            global.logger?.warn?.(
              "[guildMemberUpdate] verification tenure on Member add:",
              newMember.id,
              err?.message || err,
            );
          }
        }
        const canAnnNow = await shouldSendPublicMemberAnnouncement(newMember);
        const couldAnnBefore = await shouldSendPublicMemberAnnouncement(oldMember);
        if (canAnnNow && !couldAnnBefore) {
          await runDeferredJoinAnnouncements(newMember).catch((err?) => {
            global.logger?.warn?.("[guildMemberUpdate] deferred join announce:", newMember.guild.id, newMember.id, err?.message || err);
          });
        }
      }
      await syncStaffCmdsThreadsForMemberChange(oldMember, newMember).catch(() => { });
      await syncStaffChatThreadsForMemberChange(oldMember, newMember).catch(() => { });
      await sendMemberUpdateLog(oldMember, newMember);
      await syncMutedMirrorRoleFromMemberUpdate(oldMember, newMember).catch((err?) => {
        global.logger?.warn?.("[guildMemberUpdate] muted mirror role:", newMember.id, err?.message || err);
      });
      try {
        const { memberIsMuted } = require("../../Events/interaction/unmuteWebsiteHandlers") as typeof import("../../Events/interaction/unmuteWebsiteHandlers");
        const { autoClosePendingAppealsForUser } = require("../../features/staff/siteStaffAppealsRuntime") as typeof import("../../features/staff/siteStaffAppealsRuntime");
        const wasMuted = memberIsMuted(oldMember);
        const isMuted = memberIsMuted(newMember);
        if (wasMuted && !isMuted) {
          void autoClosePendingAppealsForUser(newMember.guild, newMember.id, "unmute").catch((err?) => {
            global.logger?.warn?.("[guildMemberUpdate] appeal auto-close unmute:", newMember.id, err?.message || err);
          });
        }
      } catch (_) {}
      await sendMemberRoleUpdateLog(oldMember, newMember);
      await enforceJoinGatePostJoinUsername(oldMember, newMember);
      const resolvedClientForClan = client || newMember.client;
      if (resolvedClientForClan) {
        await syncClanTagRolesForUserEverywhereAfterMemberEvent(resolvedClientForClan, newMember.user);
      }

      const botClient = client || newMember.client;
      if (newMember?.guild?.id === IDs.guilds.main && botClient) {
        await handleMainGuildMemberUpdate(oldMember, newMember).catch((err?) => {
          global.logger?.warn?.("[guildMemberUpdate] staff access mirror:", newMember.id, err?.message || err);
        });
        const stafferDelMeseId = String(IDs.roles?.StafferDelMese || "").trim();
        if (
          stafferDelMeseId &&
          !oldMember.roles.cache.has(stafferDelMeseId) &&
          newMember.roles.cache.has(stafferDelMeseId)
        ) {
          await grantBestStaffPauseBonusYear(newMember.guild.id, newMember.id).catch((err?) => {
            global.logger?.warn?.("[guildMemberUpdate] bestStaffPauseBonusYear:", newMember.id, err?.message || err);
          });
        }
        const stafferDellaSettimanaId = String(IDs.roles?.StafferDellaSettimana || "").trim();
        if (
          stafferDellaSettimanaId &&
          !oldMember.roles.cache.has(stafferDellaSettimanaId) &&
          newMember.roles.cache.has(stafferDellaSettimanaId)
        ) {
          await onStafferDellaSettimanaRoleAdded(newMember.guild.id, newMember.id).catch((err?) => {
            global.logger?.warn?.(
              "[guildMemberUpdate] stafferDellaSettimanaBonus:",
              newMember.id,
              err?.message || err,
            );
          });
        }
        if (didStaffMembershipChange(oldMember, newMember) || didStaffListDisplayRolesChange(oldMember, newMember)) {
          await recordManualStaffRoleHistoryIfNeeded(oldMember, newMember).catch((err?) => {
            global.logger?.warn?.("[guildMemberUpdate] manual staff rolesHistory:", newMember.id, err?.message || err);
          });
          const oldRank = getMemberStaffRankRoleId(oldMember);
          const newRank = getMemberStaffRankRoleId(newMember);
          if (oldRank !== newRank) {
            void scheduleAcceptedPauseMessagesRefreshAfterRankChange(newMember.guild, newMember.id);
          }
          if (!memberHasStaffRole(oldMember) && memberHasStaffRole(newMember)) {
            setWelcomeContextActive(newMember.guild.id);
          }
          if (memberHasAnyStaffPresenceForDepexSync(oldMember) && !memberHasAnyStaffPresenceForDepexSync(newMember)) {
                                    const verifiedMember = await newMember.guild.members
              .fetch({ user: newMember.id, force: true })
              .catch(() => null);
            if (!verifiedMember || memberHasAnyStaffPresenceForDepexSync(verifiedMember)) {
              global.logger?.warn?.(
                "[guildMemberUpdate] depex abortito (ruoli staff ancora presenti o fetch fallito):",
                newMember.id,
              );
            } else if (await shouldSuppressStaffDepexForMuteMirror(verifiedMember).catch(() => true)) {
              global.logger?.info?.(
                "[guildMemberUpdate] depex soppresso (mute mirror / restore in corso):",
                newMember.id,
              );
            } else {
              const staffLean = await ActivityUserProfile.findOne(
                { guildId: newMember.guild.id, userId: newMember.id },
                { staff: 1 },
              ).lean().catch(() => null);
              await deleteStaffPauseRequestChannelMessages(newMember.guild, newMember.id);
              await deleteStaffRelatedMessagesFromConfiguredChannels(newMember.guild, newMember.id, staffLean?.staff).catch((err?) => {
                global.logger?.warn?.("[guildMemberUpdate] staff channels scan delete:", newMember.id, err?.message || err);
              });
              try {
                const {
                  cancelPendingResocontiWorkflowForUser,
                  autoCancelPendingPausesIfNotEligible,
                } = require("../../features/workflow/siteStaffWorkflowStore") as typeof import("../../features/workflow/siteStaffWorkflowStore");
                                await cancelPendingResocontiWorkflowForUser(newMember.guild.id, newMember.id, {
                  kind: "s",
                  statusLabel: "Annullato (depex)",
                  decidedBy: "system",
                });
                if (!memberHasPartnerManagerRole(verifiedMember)) {
                  await cancelPendingResocontiWorkflowForUser(newMember.guild.id, newMember.id, {
                    kind: "p",
                    statusLabel: "Annullato (depex PM)",
                    decidedBy: "system",
                  });
                }
                await autoCancelPendingPausesIfNotEligible(newMember.guild, newMember.id, {
                  decidedBy: "system",
                  statusLabel: "Annullato (depex)",
                }).catch((err?) => {
                  global.logger?.warn?.(
                    "[guildMemberUpdate] cancel pending pauses on depex:",
                    newMember.id,
                    err?.message || err,
                  );
                });
              } catch (err) {
                global.logger?.warn?.("[guildMemberUpdate] cancel pending resoconti on depex:", newMember.id, err?.message || err);
              }
              await archiveStaffRolesHistoryThenUnsetStaff(newMember.guild.id, newMember.id);
              await autoUnclaimOpenTicketsClaimedByUser(newMember.guild, newMember.id).catch((err?) => {
                global.logger?.warn?.("[guildMemberUpdate] ticket auto-unclaim on depex:", newMember.id, err?.message || err);
              });
              try {
                require("../../Web/siteReviewsApi").scheduleExStaffReviewsPurge(botClient);
              } catch (_) {}
            }
          }
          if (memberHasPartnerManagerRole(oldMember) && !memberHasPartnerManagerRole(newMember)) {
            const verifiedPm = await newMember.guild.members
              .fetch({ user: newMember.id, force: true })
              .catch(() => null);
            if (verifiedPm && !memberHasPartnerManagerRole(verifiedPm)) {
              if (await shouldSuppressStaffDepexForMuteMirror(verifiedPm).catch(() => true)) {
                global.logger?.info?.(
                  "[guildMemberUpdate] PM depex soppresso (mute mirror / restore in corso):",
                  newMember.id,
                );
              } else {
              try {
                const {
                  cancelPendingResocontiWorkflowForUser,
                  autoCancelPendingPausesIfNotEligible,
                } = require("../../features/workflow/siteStaffWorkflowStore") as typeof import("../../features/workflow/siteStaffWorkflowStore");
                await cancelPendingResocontiWorkflowForUser(newMember.guild.id, newMember.id, {
                  kind: "p",
                  statusLabel: "Annullato (depex PM)",
                  decidedBy: "system",
                });
                await autoCancelPendingPausesIfNotEligible(newMember.guild, newMember.id, {
                  decidedBy: "system",
                }).catch((err?) => {
                  global.logger?.warn?.(
                    "[guildMemberUpdate] cancel pending pauses on PM depex:",
                    newMember.id,
                    err?.message || err,
                  );
                });
              } catch (err) {
                global.logger?.warn?.(
                  "[guildMemberUpdate] cancel pending PM resoconti on depex:",
                  newMember.id,
                  err?.message || err,
                );
              }
              }
            }
          }
          if (memberHasStaffRole(newMember) && !memberHasPartnerManagerRole(newMember)) {
            await ActivityUserProfile.updateOne(
              { guildId: newMember.guild.id, userId: newMember.id },
              buildStaffPartnerManagerIdUnsetUpdate(),
            ).catch(() => { });
          }
        }
      }

      await removePlusColorsIfNotEligible(newMember);
      await maybeAnnounceManualSocialRolesAndGrantPicPermsBundle(oldMember, newMember);
      await maybeSyncPatronRoleForMember(oldMember, newMember);
      {
        const createKeys = resolveAutoValutazioneCreateKeysFromMemberUpdate(oldMember, newMember);
        await syncPersistentAutoValutazioniForMember(newMember, {
          allowCreate: createKeys.size > 0,
          createKeys,
          allowRemove: true,
        }).catch((err?) => {
          global.logger?.warn?.("[guildMemberUpdate] staff auto valutazioni sync:", newMember.id, err?.message || err);
        });
      }
      await ensureCustomVocAccess(newMember);
      await syncCustomVocEligibilityWindow(newMember);
      await syncCustomRoleEligibilityWindow(newMember);
      await handleBoostUpdate(oldMember, newMember);
      await handleStaffBoostAutoValutazioneMemberUpdate(oldMember, newMember).catch((err?) => {
        global.logger?.warn?.("[guildMemberUpdate] staff boost auto valutazione:", newMember.id, err?.message || err);
      });
      await maybeAnnounceDonationPackageInSupporters(oldMember, newMember);

      {
        const nickChanged = String(oldMember.nickname || "") !== String(newMember.nickname || "");
        const rolesChanged =
          oldMember.roles?.cache?.size !== newMember.roles?.cache?.size ||
          [...(newMember.roles?.cache?.keys?.() || [])].some((id?) => !oldMember.roles?.cache?.has?.(id));
        const muteMirrorActive = memberIsInMuteMirrorState(newMember);
        if ((nickChanged || rolesChanged) && !newMember.user?.bot && !muteMirrorActive) {
          try {
            const { schedulePersistUserFullState } = require("./userFullStatePersistenceService") as typeof import("./userFullStatePersistenceService");
            schedulePersistUserFullState(newMember.guild.id, newMember.id, {
              member: newMember,
              guild: newMember.guild,
              client,
              reason: nickChanged && rolesChanged ? "member_nick_roles" : nickChanged ? "member_nick" : "member_roles",
            });
          } catch (err) {
            global.logger?.warn?.("[guildMemberUpdate] full state persist:", newMember.id, err?.message || err);
          }
        }
      }
    } catch (error) {
      global.logger?.error?.("[guildMemberUpdate] failed:", error);
    }
  },
};