
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { scheduleMemberCounterRefresh, updateMemberCounterNow } = require("../Utils/Community/memberCounterUtils") as typeof import("../Utils/Community/memberCounterUtils");
const { processJoinRaidForMember } = require("../Moderation/services/joinRaidService") as typeof import("../Moderation/services/joinRaidService");
const { getJoinGateConfigSnapshot, } = require("../Moderation/services/joinGateService") as typeof import("../Moderation/services/joinGateService");
const { resolveJoinGateConfiguredExempt, } = require("../Moderation/services/joinGateExemptUtils") as typeof import("../Moderation/services/joinGateExemptUtils");
const { shouldSendPublicMemberAnnouncement } = require("../Utils/Community/memberPublicAnnouncementGate") as typeof import("../Utils/Community/memberPublicAnnouncementGate");
const { getSecurityLockState } = require("../Moderation/services/securityOrchestratorService") as typeof import("../Moderation/services/securityOrchestratorService");
const { markJoinGateSuspiciousAccount, } = require("../Moderation/services/joinGateSuspiciousService") as typeof import("../Moderation/services/joinGateSuspiciousService");
const { getClientGuildCached, getGuildChannelCached, getGuildMemberCached } = require("../../shared/discord/interactionEntityCache") as typeof import("../../shared/discord/interactionEntityCache");
const { activateWelcomeContextForGuild, refreshWelcomeContextForGuild } = require("../Utils/Message/officialMessageCommunityHandlers") as typeof import("../Utils/Message/officialMessageCommunityHandlers");
const { restoreUserOnJoin } = require("../Services/Community/userLeaveBackupService") as typeof import("../Services/Community/userLeaveBackupService");
const { syncMutedMirrorOnMemberJoin } = require("../Moderation/services/mutedMirrorRoleService") as typeof import("../Moderation/services/mutedMirrorRoleService");
const { cancelCustomPerksDiscordCleanupQueue } = require("../Services/Community/customPerksDiscordCleanupQueueService") as typeof import("../Services/Community/customPerksDiscordCleanupQueueService");
const { handleTenantPartnerManagerRejoin } = require("../Partner/services/partnerManagerLeaveService") as typeof import("../Partner/services/partnerManagerLeaveService");
const { shouldApplyMainPartnershipFilters } = require("../Partner/core/partnershipConfigResolver") as typeof import("../Partner/core/partnershipConfigResolver");
const { isAlreadyVerifiedInThisGuild } = require("../Utils/Interaction/verifyUtils") as typeof import("../Utils/Interaction/verifyUtils");
const { syncPreMemberRoleForMember } = require("../Utils/Community/preMemberRoleService") as typeof import("../Utils/Community/preMemberRoleService");
const { ghostPingNewMemberOnJoin } = require("../Utils/Message/ghostPingOnChannelEnter") as typeof import("../Utils/Message/ghostPingOnChannelEnter");
const { trackMemberJoin } = require("../Services/Community/dailyMemberStatsService") as typeof import("../Services/Community/dailyMemberStatsService");
const { resolveGuildChannel, resolveInviteInfo, inviteCodeFromInfo, tryRecordTenantPartnershipInviteJoin, trackInviteJoin, announceInviteInfo, maybeSendInviteReward, maybeSendInviteNearRewardReminder } = require("./joinInvites") as typeof import("./joinInvites");
const { sendWelcomeChannelAnnouncement, handleBotJoin, hasNoAvatar, kickForJoinGate } = require("./joinBots") as typeof import("./joinBots");
const { sendDmWelcome } = require("./joinWelcome") as typeof import("./joinWelcome");
const { isTooYoungAccount, getJoinGateNameCandidate, inviteLikeInName, matchUsernameFilters, trackRecentJoinSignal, detectSuspiciousAccount } = require("./joinSuspicious") as typeof import("./joinSuspicious");
const { handleTooYoungAccount, sendJoinLog } = require("./joinGateActions") as typeof import("./joinGateActions");
const { restoreDiscadiaVoteRoleOnRejoin, restoreCustomRoleOnRejoin, maybeApplyVerificationTenureOnJoin } = require("./joinRestore") as typeof import("./joinRestore");
const { markJoinAnnouncePending, clearJoinAnnouncePending, recoverJoinAnnouncementsOnStartup, processMissedJoinMember, runDeferredJoinAnnouncements } = require("./joinRecovery") as typeof import("./joinRecovery");








function isViniliFullFeatureGuild(guildId?) {
  try {
    const { isViniliFullFeatureGuild: check } = require("../MultiGuild/core/guildFeatureScope") as typeof import("../MultiGuild/core/guildFeatureScope");
    return check(guildId);
  } catch {
    return true;
  }
}

export = {
  name: "guildMemberAdd",
  kickForJoinGate,
  runDeferredJoinAnnouncements,
  recoverJoinAnnouncementsOnStartup,
  processMissedJoinMember,
  matchUsernameFilters,
  getJoinGateNameCandidate,
  async execute(member?) {
    try {
      if (!member?.guild || !member?.user) return;

      /* test join → sync ruoli dal main subito */
      try {
        const { isTestMirrorGuild } = require("../Utils/Config/testGuildMirrorRemap") as typeof import("../Utils/Config/testGuildMirrorRemap");
        if (isTestMirrorGuild(member.guild.id) && !member.user.bot) {
          const { syncTestMemberRolesFromMain } = require("../Partner/services/testGuildMirrorSyncService") as typeof import("../Partner/services/testGuildMirrorSyncService");
          void syncTestMemberRolesFromMain(member)
            .then((out?) => {
              if (out?.ok && out.changed) {
                global.logger?.info?.(
                  `[TEST MIRROR] join role sync ${member.id}: ${out.roles} roles`,
                );
              } else if (out && !out.ok && out.reason && out.reason !== "not_on_main" && out.reason !== "in_flight") {
                global.logger?.warn?.(
                  `[TEST MIRROR] join role sync skip ${member.id}: ${out.reason}`,
                );
              }
            })
            .catch((err?) => {
              global.logger?.warn?.(
                "[guildMemberAdd] test mirror join roles:",
                member.id,
                err?.message || err,
              );
            });
        }
      } catch (eMirrorJoin) {
        global.logger?.warn?.(
          "[guildMemberAdd] test mirror join hook:",
          eMirrorJoin?.message || eMirrorJoin,
        );
      }

      if (member.guild?.id && !isViniliFullFeatureGuild(member.guild.id)) {
        await handleTenantPartnerManagerRejoin(member, member.client).catch((err?) => {
          global.logger?.warn?.("[guildMemberAdd] handleTenantPartnerManagerRejoin:", err?.message || err);
        });
        const tenantInviteInfo = await resolveInviteInfo(member).catch(() => null);
        await tryRecordTenantPartnershipInviteJoin(member, tenantInviteInfo).catch(() => {});
        return;
      }

      await trackMemberJoin(member).catch((err?) => {
        global.logger?.warn?.("[guildMemberAdd] daily member stats:", err?.message || err);
      });
      try {
        const { broadcastSiteLiveStatsChangedDebounced } = require("../site/suggestions/siteSuggestionsBroadcast") as typeof import("../site/suggestions/siteSuggestionsBroadcast");
        broadcastSiteLiveStatsChangedDebounced();
      } catch (_) {}
      const joinGateConfig = getJoinGateConfigSnapshot();
      const isCoreExempt = await resolveJoinGateConfiguredExempt(member?.guild, member?.id, member);
      if (!isCoreExempt) {
        const lockState = await getSecurityLockState(member.guild);
        if (lockState.joinLockActive) {
          await kickForJoinGate(
            member,
            "Ingresso bloccato: lockdown di sicurezza attivo.",
            [
              `<:VC_Rules:1482527309868040393> **Regola:** Blocco di sicurezza di ingresso`,
              `<:VC_Info:1482526956703580372> **Fonti:** ${lockState.sources.join(", ")}`,
            ],
            "kick",
          );
          return;
        }
      }

      if (member.user?.bot) {
        if (isCoreExempt) {
          await sendJoinLog(member);
          return;
        }
        await sendJoinLog(member);
        await handleBotJoin(member, joinGateConfig);
        return;
      }

      if (!isCoreExempt) {
        trackRecentJoinSignal(member);
        let joinGateMatch = null;
        if (
          joinGateConfig?.enabled &&
          joinGateConfig?.newAccounts?.enabled &&
          isTooYoungAccount(member, joinGateConfig?.newAccounts?.minAgeDays)
        ) {
          joinGateMatch = {
            rule: "tooYoung",
            action: joinGateConfig?.newAccounts?.action || "kick",
          };
        }
        if (!joinGateMatch && joinGateConfig?.enabled && joinGateConfig?.noAvatar?.enabled && hasNoAvatar(member)) {
          joinGateMatch = {
            rule: "noAvatar",
            reason: "Account senza avatar.",
            extraLines: [
              `<:VC_Rules:1482527309868040393> **Regola:** Account senza avatar`,
            ],
            action: joinGateConfig?.noAvatar?.action || "log",
          };
        }
        const nameCandidate = getJoinGateNameCandidate(member);
        if (
          !joinGateMatch &&
          joinGateConfig?.enabled &&
          joinGateConfig?.advertisingName?.enabled &&
          inviteLikeInName(nameCandidate)
        ) {
          joinGateMatch = {
            rule: "advertising",
            reason: "Nome pubblicitario nel username.",
            extraLines: [
              `<:VC_Rules:1482527309868040393> **Regola:** Nome pubblicitario`,
              `<:VC_Modifica:1478859646587633717> **Nome:** ${nameCandidate || "N/A"}`,
            ],
            action: joinGateConfig?.advertisingName?.action || "kick",
          };
        }
        const usernameMatch = !joinGateMatch && joinGateConfig?.enabled ? matchUsernameFilters(nameCandidate, joinGateConfig?.usernameFilter) : null;
        if (!joinGateMatch && usernameMatch) {
          joinGateMatch = {
            rule: "usernameFilter",
            reason: "Username corrisponde al pattern bloccato.",
            extraLines: [
              `<:VC_Rules:1482527309868040393> **Regola:** Filtro username`,
              `<:VC_Info:1482526956703580372> **Tipo di match:** ${usernameMatch.type}`,
              `<:VC_Modifica:1478859646587633717> **Match:** ${usernameMatch.value}`,
              `<:VC_Modifica:1478859646587633717> **Nome:** ${nameCandidate || "N/A"}`,
            ],
            action: joinGateConfig?.usernameFilter?.action || "kick",
          };
        }
        const suspiciousReason = joinGateConfig?.enabled && joinGateConfig?.suspiciousAccount?.enabled ? detectSuspiciousAccount(member) : null;
        if (suspiciousReason) {
          await markJoinGateSuspiciousAccount(member.guild.id, member.id, {
            source: "joingate",
            reason: suspiciousReason,
          }).catch(() => null);
        }
        if (!joinGateMatch && suspiciousReason) {
          joinGateMatch = {
            rule: "suspicious",
            reason: `Account sospetto: ${suspiciousReason}`,
            extraLines: [
              `<:VC_Rules:1482527309868040393> **Regola:** Account sospetto`,
              `<:VC_Reason:1478517122929004544> **Motivo:** ${suspiciousReason}`,
            ],
            action: joinGateConfig?.suspiciousAccount?.action || "log",
          };
        }
        const joinGateWillPunish =
          Boolean(joinGateMatch) &&
          String(joinGateMatch?.action || "kick").toLowerCase() !== "log";
        let joinRaidOutcome = { blocked: false };
        try {
          joinRaidOutcome = (await processJoinRaidForMember(member, { joinGateFeedOnly: joinGateWillPunish })) || { blocked: false };
        } catch (err) {
          global.logger?.warn?.("[guildMemberAdd] Join Raid failed:", member.guild.id, member.id, err?.message || err);
        }
        if (joinRaidOutcome?.blocked) return;
        if (joinGateMatch) {
          if (joinGateMatch.rule === "tooYoung") {
            await handleTooYoungAccount(member, joinGateConfig);
            return;
          }
          const kickResult = await kickForJoinGate(member, joinGateMatch.reason, joinGateMatch.extraLines || [], joinGateMatch.action,);
          if (kickResult?.blocked) return;
        }
      }

      if (String(member.guild?.id || "") === String(IDs.guilds?.main || "")) {
        void ghostPingNewMemberOnJoin(member.client, member).catch(() => {});
        if (member.client) {
          await activateWelcomeContextForGuild(member.guild.id, member.id).catch(() => {});
        }
      }

      await sendDmWelcome(member).catch(() => {});

      await handleTenantPartnerManagerRejoin(member, member.client).catch((err?) => {
        global.logger?.warn?.("[guildMemberAdd] handleTenantPartnerManagerRejoin:", err?.message || err);
      });

      if (member.guild?.id && !shouldApplyMainPartnershipFilters(member.guild.id)) {
        const tenantInviteInfo = await resolveInviteInfo(member).catch(() => null);
        await tryRecordTenantPartnershipInviteJoin(member, tenantInviteInfo).catch(() => {});
      }

      await syncMutedMirrorOnMemberJoin(member).catch((err?) => {
        global.logger?.warn?.("[guildMemberAdd] muted mirror rejoin:", member.id, err?.message || err);
      });
      await restoreUserOnJoin(member.guild.id, member.id, member).catch(() => false);
      if (String(member.guild?.id || "") === String(IDs.guilds?.main || "")) {
        await cancelCustomPerksDiscordCleanupQueue(member.guild.id, member.id).catch(() => {});
      }

      const memberForTenure = member;

      const hadVerifyRole = isAlreadyVerifiedInThisGuild(memberForTenure, member.guild.id);
      await maybeApplyVerificationTenureOnJoin(memberForTenure).catch((err?) => {
        global.logger?.warn?.("[guildMemberAdd] verificationTenureOnJoin:", err?.message || err);
      });
                  const preferFreshAfterRestore =
        hadVerifyRole || String(member.guild?.id || "") === String(IDs.guilds?.main || "");
      const memberAfterVerifyJoin =
        (preferFreshAfterRestore
          ? await getGuildMemberCached(member.guild, member.id, { preferFresh: true }).catch(() => null)
          : null) ||
        memberForTenure ||
        member;
      if (!memberAfterVerifyJoin?.guild) return;

      if (String(member.guild?.id || "") === String(IDs.guilds?.main || "")) {
        await syncPreMemberRoleForMember(memberAfterVerifyJoin).catch((err?) => {
          global.logger?.warn?.("[guildMemberAdd] preMember role:", member.id, err?.message || err);
        });
      }

      if (isCoreExempt) {
        await updateMemberCounterNow(member.guild).catch(() => { });
        scheduleMemberCounterRefresh(member.guild, {
          delayMs: 250,
          secondPassMs: 1800,
        });
        await sendJoinLog(member);
        return;
      }

      let info = null;
      let canAnnounce = true;
      if (String(member.guild?.id || "") === String(IDs.guilds?.main || "")) {
        canAnnounce = await shouldSendPublicMemberAnnouncement(memberAfterVerifyJoin);
        if (!canAnnounce) await markJoinAnnouncePending(memberAfterVerifyJoin);
        else await clearJoinAnnouncePending(memberAfterVerifyJoin);

        const welcomeChannelId = IDs.channels.chat;
        let welcomeChannel = await resolveGuildChannel(memberAfterVerifyJoin.guild, welcomeChannelId);
        if (!welcomeChannel && memberAfterVerifyJoin.client) {
          const mainGuild = await getClientGuildCached(memberAfterVerifyJoin.client, IDs.guilds.main);
          welcomeChannel = mainGuild ? await getGuildChannelCached(mainGuild, welcomeChannelId) : null;
        }
        if (!welcomeChannel) {
          const detail = {
            guildId: String(memberAfterVerifyJoin.guild?.id || ""),
            channelId: String(welcomeChannelId || ""),
            cached: Boolean(memberAfterVerifyJoin.guild?.channels?.cache?.has?.(String(welcomeChannelId || ""))),
          };
          try {
            const fetched = await memberAfterVerifyJoin.guild.channels.fetch(String(welcomeChannelId)).catch((err?) => {
              const code = err?.code || err?.rawError?.code || null;
              global.logger?.warn?.("[guildMemberAdd] Welcome channel fetch failed:", {
                ...detail,
                code,
                status: err?.status ?? err?.statusCode ?? null,
                message: String(err?.message || ""),
                missingAccess: code === 50001 || code === 50013,
              });
              return null;
            });
            if (fetched?.isTextBased?.()) {
              welcomeChannel = fetched;
            } else {
              global.logger?.warn?.("[guildMemberAdd] Welcome channel not found:", detail);
            }
          } catch (e) {
            global.logger?.warn?.("[guildMemberAdd] Welcome channel not found:", detail, e?.message || e);
          }
        }

        if (canAnnounce && memberAfterVerifyJoin.client) {
          await refreshWelcomeContextForGuild(memberAfterVerifyJoin.guild.id, memberAfterVerifyJoin.id);
        }
        if (welcomeChannel && canAnnounce) {
          await sendWelcomeChannelAnnouncement(welcomeChannel, memberAfterVerifyJoin);
          info = await resolveInviteInfo(memberAfterVerifyJoin).catch(() => null);
          await announceInviteInfo(memberAfterVerifyJoin, welcomeChannel, info);
        }
      }

      setImmediate(() => {
        (async () => {
          try {
            await restoreDiscadiaVoteRoleOnRejoin(member).catch(() => {});
            await restoreCustomRoleOnRejoin(member).catch(() => {});
            await sendJoinLog(memberAfterVerifyJoin).catch(() => {});

            if (canAnnounce) {
              if (info && !info.isVanity && info.inviterId) {
                await trackInviteJoin(member, info.inviterId, inviteCodeFromInfo(info)).catch(() => { });
              }
              await maybeSendInviteNearRewardReminder(member, info);
              await maybeSendInviteReward(member, info);
            }

            scheduleMemberCounterRefresh(member.guild, { delayMs: 250, secondPassMs: 1800 });
          } catch (err) {
            global.logger?.warn?.("[guildMemberAdd] background post-welcome failed:", member.guild?.id, member?.id, err?.message || err);
          }
        })();
      });
    } catch (error) {
      global.logger?.error?.("[guildMemberAdd] failed:", error);
    }
  },
};