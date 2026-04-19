const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../Config/ids");
const { memberHasStaffRole } = require("../Community/staffListUtils");
const { deleteStaffPauseRequestChannelMessages, deleteStaffRelatedMessagesFromConfiguredChannels } = require("./staffDocUtils");

const ROLE_PM = IDs.roles.PartnerManager;
const ROLE_STAFF_GENERIC = IDs.roles.Staff;

function memberHasPartnerManagerRole(member) {
  return Boolean(ROLE_PM && member?.roles?.cache?.has?.(ROLE_PM));
}

function memberHasAnyStaffPresenceForDepexSync(member) {
  if (!member?.roles?.cache) return false;
  if (memberHasStaffRole(member)) return true;
  return Boolean(ROLE_STAFF_GENERIC && member.roles.cache.has(ROLE_STAFF_GENERIC));
}

/** Inizializza i campi DB legati al ruolo Partner Manager (solo quando l'utente ha il PM). */
function initPartnerManagerFieldsIfMissing(staffObj) {
  if (!staffObj) return;
  if (staffObj.partnerCount === undefined) staffObj.partnerCount = 0;
  if (!Array.isArray(staffObj.partnerActions)) staffObj.partnerActions = [];
  if (staffObj.managerId === undefined) staffObj.managerId = null;
  if (!Array.isArray(staffObj.partnerMilestoneDmSent)) staffObj.partnerMilestoneDmSent = [];
}

function buildStaffPartnerFieldsUnsetUpdate() {
  return {
    $unset: {
      "staff.partnerCount": "",
      "staff.partnerActions": "",
      "staff.managerId": "",
    },
  };
}

/** Solo assegnazione PM corrente: non tocca conteggio né storico (serve per classifica e audit). */
function buildStaffPartnerManagerIdUnsetUpdate() {
  return { $unset: { "staff.managerId": "" } };
}

/**
 * Dopo un depex (o equivalente): se non resta nessun ruolo staff list → elimina tutto `staff`.
 * Se resta staff ma non più PM → rimuove solo `managerId` (storico partner e punti restano nel DB).
 */
async function applyStaffDatabaseAfterDepex(guildId, userId, member) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return;
  if (!member) {
    // Evita wipe distruttivi in caso di fetch membro fallita temporaneamente.
    return;
  }
  if (memberHasAnyStaffPresenceForDepexSync(member)) {
    if (!memberHasPartnerManagerRole(member)) {
      await ActivityUserProfile.updateOne(
        { guildId: gid, userId: uid },
        buildStaffPartnerManagerIdUnsetUpdate(),
      ).catch(() => null);
    }
  } else {
    await ActivityUserProfile.updateOne(
      { guildId: gid, userId: uid, staff: { $exists: true } },
      { $unset: { staff: "" } },
    ).catch(() => null);
  }
}

/**
 * Dopo un depex: se l'utente non ha più ruoli staff list, cancella messaggi/thread pausa nel canale e poi allinea il DB (`applyStaffDatabaseAfterDepex`).
 */
async function syncStaffDbAndPauseChannelAfterDepex(guild, userId, member) {
  const gid = String(guild?.id || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return;
  if (!member) return;
  if (!memberHasAnyStaffPresenceForDepexSync(member)) {
    await deleteStaffPauseRequestChannelMessages(guild, uid);
    await deleteStaffRelatedMessagesFromConfiguredChannels(guild, uid);
  }
  await applyStaffDatabaseAfterDepex(gid, uid, member);
}

module.exports = {
  ROLE_PM,
  memberHasPartnerManagerRole,
  memberHasAnyStaffPresenceForDepexSync,
  initPartnerManagerFieldsIfMissing,
  buildStaffPartnerFieldsUnsetUpdate,
  buildStaffPartnerManagerIdUnsetUpdate,
  applyStaffDatabaseAfterDepex,
  syncStaffDbAndPauseChannelAfterDepex,
};