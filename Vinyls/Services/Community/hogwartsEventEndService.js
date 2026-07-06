const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const { HOUSES } = require("../../Utils/Web/hogwartsSortingBank");
const IDs = require("../../Utils/Config/ids");

const SORTING_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;

function normalizeId(value) {
  return String(value || "").trim();
}

async function assignCompletionRoleToMember(member, roleId) {
  const rid = normalizeId(roleId);
  if (!rid || !member) return { code: "no_member" };
  if (member.roles?.cache?.has(rid)) return { code: "already" };
  if (member.manageable === false) return { code: "not_manageable" };
  try {
    await member.roles.add(rid, "Smistamento Evento Hogwarts");
    return { code: "assigned" };
  } catch (err) {
    return { code: "error", error: String(err?.message || err).slice(0, 200) };
  }
}

async function maybeAssignHogwartsCompletionRoleOnJoin(client, member) {
  if (!member?.guild || member.user?.bot) return;
  const cfg = resolveHogwartsEventConfig(client);
  const roleId = normalizeId(cfg.completionRoleId);
  const eventKey = normalizeId(cfg.eventKey);
  const guildId = normalizeId(member.guild.id);
  if (!roleId || !eventKey || guildId !== normalizeId(IDs.guilds?.main)) return;
  const sorted = await SiteDocument.findOne({
    docType: SORTING_DOC,
    guildId,
    userId: normalizeId(member.id),
    dedupeKey: eventKey,
    status: { $in: HOUSES },
  })
    .select({ _id: 1 })
    .lean()
    .catch(() => null);
  if (!sorted) return;
  const result = await assignCompletionRoleToMember(member, roleId);
  if (result.code === "error") {
    global.logger?.warn?.("[HOGWARTS SORTING] join participant role:", member.id, result.error);
  }
}

async function runHogwartsEventCompletionSweep() {}

function startHogwartsEventEndLoop() {}

module.exports = {
  assignCompletionRoleToMember,
  maybeAssignHogwartsCompletionRoleOnJoin,
  runHogwartsEventCompletionSweep,
  startHogwartsEventEndLoop,
};