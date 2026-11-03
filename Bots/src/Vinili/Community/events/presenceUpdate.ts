const { syncPersistentAutoValutazioniForMember } = require("../../Staff/services/staffAutoValutazioniService") as typeof import("../../Staff/services/staffAutoValutazioniService");
const {
  MAIN_GUILD_ID,
  isBotMember,
  isOfflinePresence,
  resolveInviteState,
} = require("./presenceSupporterInviteState") as typeof import("./presenceSupporterInviteState");
const {
  withDefaultState,
  getCachedState,
  setCachedState,
  getPersistedStatus,
} = require("./presenceSupporterStateCache") as typeof import("./presenceSupporterStateCache");
const { applyOnlineState } = require("./presenceSupporterApplyOnline") as typeof import("./presenceSupporterApplyOnline");
const {
  bootstrapSupporter,
  recoverSupporterStatusAnnouncesOnStartup,
  startCleanupClock,
} = require("./presenceSupporterBootstrap") as typeof import("./presenceSupporterBootstrap");

export = {
  name: "presenceUpdate",
  async execute(oldPresence?, newPresence?) {
    try {
      const member = newPresence?.member || oldPresence?.member;
      if (!member || isBotMember(member)) return;
      if (MAIN_GUILD_ID && String(member.guild.id) !== MAIN_GUILD_ID) return;

      startCleanupClock(member.client, member.guild.id);

      const guildId = member.guild.id;
      const userId = member.id;
      let prev = getCachedState(guildId, userId);
      if (!prev) {
        const persisted = await getPersistedStatus(guildId, userId);
        if (persisted) {
          prev = {
            hasLink: Boolean(persisted.hasLink),
            lastAnnounced: persisted.lastSentAt
              ? new Date(persisted.lastSentAt).getTime()
              : 0,
            lastMessageId: persisted.lastMessageId || null,
            lastSeenOnlineAt: 0,
            inviteMissSince: null,
            removalDueAt: persisted.removalDueAt || null,
          };
          setCachedState(guildId, userId, prev);
        }
      }

      const prevHas = typeof prev?.hasLink === "boolean" ? prev.hasLink : resolveInviteState(oldPresence, false);

      if (isOfflinePresence(newPresence)) {
        if (!getCachedState(guildId, userId)) {
          setCachedState(
            guildId,
            userId,
            withDefaultState({
              hasLink: prevHas,
              lastAnnounced: prev?.lastAnnounced,
              lastSeenOnlineAt: prev?.lastSeenOnlineAt,
            }),
          );
        }
        return;
      }

      await applyOnlineState(member, userId, prev, prevHas, newPresence);
      {
        const nowHasVanity = resolveInviteState(newPresence, false);
        const vanityJustAdded = !prevHas && nowHasVanity;
        await syncPersistentAutoValutazioniForMember(member, {
          allowCreate: vanityJustAdded,
          createKeys: vanityJustAdded ? new Set(["supporto_vanity_supporter_clantag"]) : null,
          allowRemove: false,
        }).catch((err?) => {
          global.logger?.warn?.("[presenceUpdate] staff auto valutazioni sync:", member.id, err?.message || err);
        });
      }
    } catch (error) {
      global.logger?.error?.("[presenceUpdate] failed:", error);
    }
  },
  bootstrapSupporter,
  recoverSupporterStatusAnnouncesOnStartup,
  resolveInviteState,
};
