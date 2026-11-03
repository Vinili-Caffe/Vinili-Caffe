const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../../../../../src/Vinili/Community/schemas/communitySchemas") as typeof import("../../../../../../src/Vinili/Community/schemas/communitySchemas");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { getHouseMeta, HOUSES } = require("../../Utils/Web/hogwartsSortingBank") as typeof import("../../Utils/Web/hogwartsSortingBank");
const { housePointPeriodKey } = require("../../Utils/Web/hogwartsHousePointPeriods") as typeof import("../../Utils/Web/hogwartsHousePointPeriods");
const HOUSE_POINTS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS;
const HOUSE_POINTS_OWNER_ID = "__event__";
const HOUSE_ALIASES = Object.freeze({ gryffindor: "gryffindor", grifondoro: "gryffindor", griffindor: "gryffindor", hufflepuff: "hufflepuff", tassorosso: "hufflepuff", ravenclaw: "ravenclaw", corvonero: "ravenclaw", slytherin: "slytherin", serpeverde: "slytherin" });

function normalizeHouseInput(raw?) {
  const key = String(raw || "").trim().toLowerCase();
  if (!key) return "";
  const mapped = HOUSE_ALIASES[key] || key;
  return HOUSES.includes(mapped) ? mapped : "";
}

function houseLabel(houseId?, eventCfg?) {
  const crest = String(eventCfg?.houses?.[houseId]?.crestUrl || "").trim();
  return getHouseMeta(houseId, crest || undefined)?.label || houseId;
}

async function assignManualHousePoints(client, { guildId, houseId, points, actorId, reason = "" }) {
  const gid = String(guildId || "").trim();
  const hid = normalizeHouseInput(houseId);
  const pts = Math.floor(Number(points) || 0);
  const actor = String(actorId || "").trim();
  if (!gid || !hid || !pts || !actor) return { ok: false, code: "bad_input" };
  const eventCfg = resolveHogwartsEventConfig(client);
  const eventKey = String(eventCfg?.eventKey || "").trim() || "hogwarts";
  const period = housePointPeriodKey(Date.now());
  const periodKey = String(period?.key || "").trim();
  const now = new Date();
  const gameKey = "staffManual";
  const rewardKey = `staff_manual:${actor}:${now.getTime()}`;
  const inc = {
    [`rawWebhook.byGame.${gameKey}`]: pts,
    "rawWebhook.total": pts,
    [`rawWebhook.totals.${hid}`]: pts,
  };
  if (periodKey) inc[`rawWebhook.byPeriod.${periodKey}.${hid}`] = pts;
  await SiteDocument.findOneAndUpdate(
    {
      docType: HOUSE_POINTS_DOC,
      guildId: gid,
      userId: HOUSE_POINTS_OWNER_ID,
      dedupeKey: eventKey,
    },
    {
      $setOnInsert: {
        docType: HOUSE_POINTS_DOC,
        guildId: gid,
        userId: HOUSE_POINTS_OWNER_ID,
        dedupeKey: eventKey,
        createdBy: "staff_manual_house_points",
        status: "active",
      },
      $set: {
        planKey: "hogwarts_house_points",
        "rawWebhook.eventKey": eventKey,
        "rawWebhook.updatedAt": now,
      },
      $push: {
        "rawWebhook.manualAwards": {
          $each: [
            {
              houseId: hid,
              points: pts,
              actorId: actor,
              reason: String(reason || "").slice(0, 200),
              periodKey: periodKey || null,
              rewardKey,
              at: now.toISOString(),
            },
          ],
          $slice: -100,
        },
      },
      $inc: inc,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return {
    ok: true,
    houseId: hid,
    houseLabel: houseLabel(hid, eventCfg),
    points: pts,
    periodKey,
    periodLabel: period?.label || "",
    reason: String(reason || "").slice(0, 200),
  };
}

export = { HOUSE_ALIASES, normalizeHouseInput, assignManualHousePoints };