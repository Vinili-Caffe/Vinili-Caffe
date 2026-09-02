const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");

const FINALE_PUBLISH_DOC = "hogwarts_finale_prizes";
const WIPE_DOC = "hogwarts_event_data_wipe";
const EVENT_OWNER_ID = "__event__";

const WIPE_DOC_TYPES = Object.freeze([
  SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS,
  SITE_DOCUMENT_TYPE.HOGWARTS_SORTING,
  SITE_DOCUMENT_TYPE.HOGWARTS_FORBIDDEN_BOOKS,
  SITE_DOCUMENT_TYPE.HOGWARTS_REACT_PRESS,
  SITE_DOCUMENT_TYPE.HOGWARTS_SPELL_LIST_HUNT,
  SITE_DOCUMENT_TYPE.HOGWARTS_FINALE_CHAOS,
  SITE_DOCUMENT_TYPE.HOGWARTS_MINIGAME_SPAWN_WINDOW,
  SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_CHANNEL_MINIGAME_SCHEDULER,
  SITE_DOCUMENT_TYPE.HOGWARTS_EVENT_COMPLETION,
]);

function normalizeId(value) {
  return String(value || "").trim();
}

async function findWipeMarker(guildId, dedupeKey) {
  return SiteDocument.findOne({
    docType: WIPE_DOC,
    guildId: normalizeId(guildId),
    userId: EVENT_OWNER_ID,
    dedupeKey: normalizeId(dedupeKey),
  })
    .lean()
    .catch(() => null);
}

async function markWipe(guildId, dedupeKey, summary) {
  return SiteDocument.findOneAndUpdate(
    {
      docType: WIPE_DOC,
      guildId: normalizeId(guildId),
      userId: EVENT_OWNER_ID,
      dedupeKey: normalizeId(dedupeKey),
    },
    {
      $setOnInsert: {
        docType: WIPE_DOC,
        guildId: normalizeId(guildId),
        userId: EVENT_OWNER_ID,
        dedupeKey: normalizeId(dedupeKey),
        createdBy: "hogwarts_event_data_wipe",
      },
      $set: {
        status: "completed",
        planKey: "hogwarts_event_data_wipe",
        decidedAt: new Date(),
        "rawWebhook.summary": summary || {},
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

async function findFinalePublishMarker(guildId, dedupeKey) {
  return SiteDocument.findOne({
    docType: FINALE_PUBLISH_DOC,
    guildId: normalizeId(guildId),
    userId: EVENT_OWNER_ID,
    dedupeKey: normalizeId(dedupeKey),
  })
    .lean()
    .catch(() => null);
}

async function wipeHogwartsEventData(client, options = {}) {
  const cfg = resolveHogwartsEventConfig(client);
  const eventKey = normalizeId(options.eventKey || cfg.eventKey);
  const guildId = normalizeId(options.guildId || IDs.guilds?.main);
  const nowMs = options.nowMs != null ? Number(options.nowMs) : Date.now();
  const endMs = Number(cfg.endMs || 0);

  if (!eventKey || !guildId) {
    return { skipped: true, reason: "bad_input" };
  }
  if (!options.force && (!Number.isFinite(endMs) || nowMs < endMs)) {
    return { skipped: true, reason: "event_not_ended" };
  }

  const prizesKey = `${eventKey}_finale_prizes`;
  if (!options.force) {
    const prizes = await findFinalePublishMarker(guildId, prizesKey);
    if (prizes?.status !== "completed") {
      return { skipped: true, reason: "prizes_pending" };
    }
  }

  const wipeKey = `${eventKey}_data_wipe`;
  const existing = await findWipeMarker(guildId, wipeKey);
  if (existing?.status === "completed" && !options.force) {
    return { skipped: true, reason: "already_done", summary: existing?.rawWebhook?.summary || null };
  }

    const keepRes = await ActivityUserProfile.updateMany(
    {
      guildId,
      "profile.events.hogwarts.finaleRoleRewards": { $exists: true },
    },
    [
      {
        $set: {
          "profile.events.hogwarts": {
            finaleRoleRewards: "$profile.events.hogwarts.finaleRoleRewards",
          },
        },
      },
    ],
  ).catch((err) => {
    global.logger?.error?.("[HOGWARTS EVENT WIPE] profile keep:", err?.message || err);
    return null;
  });

  const unsetRes = await ActivityUserProfile.updateMany(
    {
      guildId,
      "profile.events.hogwarts": { $exists: true },
      "profile.events.hogwarts.finaleRoleRewards": { $exists: false },
    },
    { $unset: { "profile.events.hogwarts": "" } },
  ).catch((err) => {
    global.logger?.error?.("[HOGWARTS EVENT WIPE] profile unset:", err?.message || err);
    return null;
  });

    const docsRes = await SiteDocument.deleteMany({
    guildId,
    docType: { $in: [...WIPE_DOC_TYPES] },
  }).catch((err) => {
    global.logger?.error?.("[HOGWARTS EVENT WIPE] docs:", err?.message || err);
    return null;
  });

  const summary = {
    eventKey,
    wipedAt: new Date(nowMs).toISOString(),
    profilesKeptRewards: Number(keepRes?.modifiedCount || 0),
    profilesUnset: Number(unsetRes?.modifiedCount || 0),
    siteDocsDeleted: Number(docsRes?.deletedCount || 0),
  };

  await markWipe(guildId, wipeKey, summary);
  global.logger?.info?.(
    `[HOGWARTS EVENT WIPE] keep=${summary.profilesKeptRewards} unset=${summary.profilesUnset} docs=${summary.siteDocsDeleted}`,
  );
  return { skipped: false, summary };
}

async function maybeWipeHogwartsEventDataAfterFinale(client, options = {}) {
  return wipeHogwartsEventData(client, options);
}

module.exports = {
  wipeHogwartsEventData,
  maybeWipeHogwartsEventDataAfterFinale,
  WIPE_DOC,
};
