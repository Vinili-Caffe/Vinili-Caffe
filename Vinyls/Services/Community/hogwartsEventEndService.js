const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const { HOUSES } = require("../../Utils/Web/hogwartsSortingBank");
const { resolveSortedHouseId } = require("../../Utils/Web/hogwartsSortingResolve");
const { ensureSortedMemberHouseRoles } = require("./hogwartsSortingRoleService");
const IDs = require("../../Utils/Config/ids");

const SORTING_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;

function normalizeId(value) {
  return String(value || "").trim();
}

async function maybeAssignHogwartsCompletionRoleOnJoin(client, member) {
  if (!member?.guild || member.user?.bot) return;
  const cfg = resolveHogwartsEventConfig(client);
  const eventKey = normalizeId(cfg.eventKey);
  const guildId = normalizeId(member.guild.id);
  if (!eventKey || guildId !== normalizeId(IDs.guilds?.main)) return;

  const sorted = await SiteDocument.findOne({
    docType: SORTING_DOC,
    guildId,
    userId: normalizeId(member.id),
    dedupeKey: eventKey,
    status: { $in: HOUSES },
  })
    .select({ status: 1, houseId: 1, house: 1, rawWebhook: 1 })
    .lean()
    .catch(() => null);
  if (!sorted) return;

  const houseId = resolveSortedHouseId(sorted);
  if (!houseId) return;

  const result = await ensureSortedMemberHouseRoles(member, cfg, houseId);
  if (result.roleError) {
    global.logger?.warn?.("[HOGWARTS SORTING] join role repair:", member.id, result.roleError);
  }
}

async function runHogwartsEventCompletionSweep() {}

function startHogwartsEventEndLoop() {}

module.exports = {
  maybeAssignHogwartsCompletionRoleOnJoin,
  runHogwartsEventCompletionSweep,
  startHogwartsEventEndLoop,
};
