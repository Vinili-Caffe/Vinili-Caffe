const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { getHouseMeta, HOUSES } = require("../../Utils/Web/hogwartsSortingBank") as typeof import("../../Utils/Web/hogwartsSortingBank");
const { housePointPeriodKey, rankHousesForPeriod } = require("../../Utils/Web/hogwartsHousePointPeriods") as typeof import("../../Utils/Web/hogwartsHousePointPeriods");
const { findSortingDoc, findSortingDocForHouseMember, resolveSortedHouseId, SORTING_DOC_HOUSE_SELECT } = require("../../Utils/Web/hogwartsSortingResolve") as typeof import("../../Utils/Web/hogwartsSortingResolve");
const { normalizeHouseInput } = require("./hogwartsManualHousePointsService") as typeof import("./hogwartsManualHousePointsService");
const { resolveHouseChannelId } = require("./hogwartsBasiliskService") as typeof import("./hogwartsBasiliskService");
const { resolveHouseCrestEmbedAssets } = require("../../Utils/Web/hogwartsEventAssets") as typeof import("../../Utils/Web/hogwartsEventAssets");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { sendDm } = require("../../Utils/noDmList") as typeof import("../../Utils/noDmList");
const { accountUsername, resolveEmbedUserAvatarUrl } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const { revokeHouseSortingAnnouncesForMember, logHogwartsSortingCompleted } = require("./hogwartsSortingLogService") as typeof import("./hogwartsSortingLogService");
const { assignHouseRoles } = require("./hogwartsSortingRoleService") as typeof import("./hogwartsSortingRoleService");

const SORTING_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const HOUSE_POINTS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS;
const HOUSE_POINTS_OWNER_ID = "__event__";
const PODIUM_LABELS = ["1°", "2°", "3°", "4°"];

function houseLabel(houseId?, eventCfg?) {
  const crest = String(eventCfg?.houses?.[houseId]?.crestUrl || "").trim();
  return getHouseMeta(houseId, crest || undefined)?.label || houseId;
}

function resolveCrestUrl(houseId?, eventCfg?) {
  const fromCfg = String(eventCfg?.houses?.[houseId]?.crestUrl || "").trim();
  if (fromCfg) return fromCfg;
  const meta = getHouseMeta(houseId);
  if (meta?.crestFile) return `https://viniliecaffe.it/images/evento-hogwarts/crests/${meta.crestFile}`;
  return "";
}

function readHouseTotals(pointsDoc?) {
  const totals = pointsDoc?.rawWebhook?.totals && typeof pointsDoc.rawWebhook.totals === "object"
    ? pointsDoc.rawWebhook.totals
    : {};
  const out: Record<string, any> = {};
  for (const id of HOUSES) out[id] = Math.max(0, Math.floor(Number(totals[id]) || 0));
  return out;
}

function rankFromTotals(totals?, houseId?) {
  const ranked = HOUSES.map((id?) => ({ houseId: id, points: totals[id] || 0 })).sort((a?, b?) => {
    if (b.points !== a.points) return b.points - a.points;
    return HOUSES.indexOf(a.houseId) - HOUSES.indexOf(b.houseId);
  });
  const idx = ranked.findIndex((row?) => row.houseId === houseId);
  return { rank: idx >= 0 ? idx + 1 : null, ranked };
}

async function loadHousePointsDoc(guildId?, eventKey?) {
  return SiteDocument.findOne({
    docType: HOUSE_POINTS_DOC,
    guildId: String(guildId || "").trim(),
    userId: HOUSE_POINTS_OWNER_ID,
    dedupeKey: String(eventKey || "").trim(),
  })
    .lean()
    .catch(() => null);
}

async function fetchSortedHouseMemberDocs(guildId?, eventKey?, houseId?) {
  const gid = String(guildId || "").trim();
  const ek = String(eventKey || "").trim();
  const hid = normalizeHouseInput(houseId);
  if (!gid || !ek || !hid) return [];
  const docs = await SiteDocument.find({
    docType: SORTING_DOC,
    guildId: gid,
    dedupeKey: ek,
  })
    .select(SORTING_DOC_HOUSE_SELECT)
    .lean()
    .catch(() => []);
  return (Array.isArray(docs) ? docs : []).filter((doc?) => resolveSortedHouseId(doc) === hid);
}

async function countSortedMembersInHouse(guildId?, eventKey?, houseId?) {
  const rows = await fetchSortedHouseMemberDocs(guildId, eventKey, houseId);
  return rows.length;
}

async function fetchHouseDashboardData(client?, guildId?, houseId?) {
  const hid = normalizeHouseInput(houseId);
  if (!hid) return null;
  const eventCfg = resolveHogwartsEventConfig(client);
  const eventKey = String(eventCfg?.eventKey || "").trim() || "hogwarts";
  const period = housePointPeriodKey(Date.now());
  const periodKey = String(period?.key || "").trim();
  const pointsDoc = await loadHousePointsDoc(guildId, eventKey);
  const totals = readHouseTotals(pointsDoc);
  const periodRanked = periodKey ? rankHousesForPeriod(pointsDoc, periodKey) : [];
  const periodRow = periodRanked.find((row?) => row.houseId === hid);
  const periodPoints = Math.max(0, Math.floor(Number(periodRow?.points) || 0));
  const periodRank = periodRow ? periodRanked.findIndex((row?) => row.houseId === hid) + 1 : null;
  const totalPoints = totals[hid] || 0;
  const { rank: totalRank } = rankFromTotals(totals, hid);
  const sortedCount = await countSortedMembersInHouse(guildId, eventKey, hid);
  return {
    houseId: hid,
    houseLabel: houseLabel(hid, eventCfg),
    crestUrl: resolveCrestUrl(hid, eventCfg),
    color: getHouseMeta(hid, eventCfg?.houses?.[hid]?.crestUrl)?.primary || "#6f4e37",
    periodKey,
    periodLabel: period?.label || "",
    periodRangeLabel: period?.rangeLabel || "",
    periodPoints,
    periodRank,
    totalPoints,
    totalRank,
    sortedCount,
    eventKey,
  };
}

function resolveHouseAnnounceChannelId(eventCfg?, houseId?) {
  const hid = normalizeHouseInput(houseId);
  if (!hid) return "";
  const fromCfg = String(eventCfg?.houses?.[hid]?.logChannelId || eventCfg?.houses?.[hid]?.announceChannelId || "").trim();
  if (fromCfg) return fromCfg;
  return resolveHouseChannelId(hid);
}

function buildExpulsionEmbed(meta?, lines?) {
  return new EmbedBuilder()
    .setColor(meta?.primary || "#8b3a3a")
    .setTitle("<:VC_Lock:1482526739044368476> Espulsione dalla casata")
    .setDescription(lines.filter(Boolean).join("\n"))
    .setTimestamp(new Date());
}

async function notifySortedMemberExpulsion(client, guild, eventCfg, { targetUserId, houseId, actorId, targetMember }) {
  const uid = String(targetUserId || "").trim();
  const hid = normalizeHouseInput(houseId);
  const actor = String(actorId || "").trim();
  if (!uid || !hid || !guild) return;
  const label = houseLabel(hid, eventCfg);
  const meta = getHouseMeta(hid, eventCfg?.houses?.[hid]?.crestUrl);
  const customCrest = eventCfg?.houses?.[hid]?.crestUrl;
  const targetUser = targetMember?.user || client?.users?.cache?.get(uid) || (await client?.users?.fetch(uid).catch(() => null));
  const targetName = accountUsername(targetUser) || targetUser?.username || uid;
  const actorMember = guild.members?.cache?.get(actor) || (await guild.members?.fetch(actor).catch(() => null));
  const actorName = accountUsername(actorMember?.user) || actorMember?.displayName || actor;
  const channelId = resolveHouseAnnounceChannelId(eventCfg, hid);
  const channel = channelId ? await getGuildChannelCached(guild, channelId) : null;
  if (channel?.isTextBased?.()) {
    const channelCrest = resolveHouseCrestEmbedAssets(client, hid, customCrest);
    const roleId = String(eventCfg?.houses?.[hid]?.roleId || "").trim();
    const houseEmbed = buildExpulsionEmbed(meta, [
      `<@${uid}> è stato **espulso** da **${label}**.`,
      "Lo smistamento è stato annullato e i ruoli casata sono stati rimossi.",
      `Decisione del prefetto **${actorName}**.`,
    ]);
    if (channelCrest.thumbnail) houseEmbed.setThumbnail(channelCrest.thumbnail);
    const authorIcon = await resolveEmbedUserAvatarUrl(targetMember || targetUser || { id: uid }, { size: 256 });
    houseEmbed.setAuthor({ name: targetName, iconURL: authorIcon });
    await channel.send({
      content: [uid ? `<@${uid}>` : "", roleId ? `<@&${roleId}>` : ""].filter(Boolean).join(" ") || undefined,
      embeds: [houseEmbed],
      files: channelCrest.files.length ? channelCrest.files : undefined,
      allowedMentions: { users: uid ? [uid] : [], roles: roleId ? [roleId] : [] },
    }).catch((err?) => {
      global.logger?.warn?.("[punticasa-expel] house channel:", hid, err?.message || err);
    });
  }
  if (targetUser) {
    const dmCrest = resolveHouseCrestEmbedAssets(client, hid, customCrest);
    const dmEmbed = buildExpulsionEmbed(meta, [
      `Sei stato **espulso** dalla casata **${label}** su **${guild.name}**.`,
      "Il tuo smistamento è stato annullato e non hai più accesso ai ruoli e ai canali della casata.",
      "Per rientrare in una casata dovrai rifare lo smistamento quando sarà di nuovo disponibile.",
      `Decisione del prefetto **${actorName}**.`,
    ]);
    if (dmCrest.thumbnail) dmEmbed.setThumbnail(dmCrest.thumbnail);
    await sendDm(
      targetUser,
      { embeds: [dmEmbed], files: dmCrest.files.length ? dmCrest.files : undefined },
      { guildId: guild.id, bypassNoDm: true },
    ).catch((err?) => {
      global.logger?.warn?.("[punticasa-expel] dm:", uid, err?.message || err);
    });
  }
}

async function expelSortedMemberFromHouse(client?, guild?, targetUserId?, expectedHouseId?, actorId?) {
  const gid = String(guild?.id || "").trim();
  const uid = String(targetUserId || "").trim();
  const hid = normalizeHouseInput(expectedHouseId);
  const actor = String(actorId || "").trim();
  if (!gid || !uid || !hid || !actor) return { ok: false, code: "bad_input" };
  const eventCfg = resolveHogwartsEventConfig(client);
  const eventKey = String(eventCfg?.eventKey || "").trim();
  const doc = await findSortingDocForHouseMember(gid, uid, eventKey, hid);
  const sortedHouse = resolveSortedHouseId(doc);
  if (!doc || !sortedHouse) return { ok: false, code: "not_sorted" };
  if (sortedHouse !== hid) return { ok: false, code: "wrong_house", sortedHouse };
  await SiteDocument.deleteOne({ _id: doc._id }).catch(() => null);
  revokeHouseSortingAnnouncesForMember({ guildId: gid, userId: uid });
  const member = guild?.members?.cache?.get(uid) || (await guild?.members?.fetch(uid).catch(() => null));
  if (member) {
    const roleIds = [...new Set(
      HOUSES.map((house?) => String(eventCfg?.houses?.[house]?.roleId || "").trim()).filter(Boolean),
    )];
    const toRemove = roleIds.filter((roleId?) => member.roles.cache.has(roleId));
    if (toRemove.length) {
      await member.roles.remove(toRemove, `Espulsione casata (${houseLabel(hid, eventCfg)}) — staff ${actor}`).catch(() => null);
    }
  }
  await notifySortedMemberExpulsion(client, guild, eventCfg, {
    targetUserId: uid,
    houseId: hid,
    actorId: actor,
    targetMember: member,
  }).catch(() => null);
  return {
    ok: true,
    houseId: hid,
    houseLabel: houseLabel(hid, eventCfg),
    userId: uid,
  };
}

function formatRankLabel(rank?) {
  const n = Math.floor(Number(rank) || 0);
  if (n < 1 || n > 4) return "—";
  return PODIUM_LABELS[n - 1] || `${n}°`;
}

function floorPts(value?) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

async function transferMemberHousePointsContribution(guildId?, eventKey?, userId?, fromHouseId?, toHouseId?) {
  const gid = String(guildId || "").trim();
  const ek = String(eventKey || "").trim();
  const uid = String(userId || "").trim();
  const from = normalizeHouseInput(fromHouseId);
  const to = normalizeHouseInput(toHouseId);
  if (!gid || !ek || !uid || !from || !to || from === to) {
    return { movedTotal: 0, skipped: true };
  }
  const doc = await SiteDocument.findOne({
    docType: HOUSE_POINTS_DOC,
    guildId: gid,
    userId: HOUSE_POINTS_OWNER_ID,
    dedupeKey: ek,
  }).catch(() => null);
  if (!doc) return { movedTotal: 0, missingDoc: true };

  const raw = doc.rawWebhook && typeof doc.rawWebhook === "object" ? { ...doc.rawWebhook } : {};
  const byMember = raw.byMember && typeof raw.byMember === "object" ? { ...raw.byMember } : {};
  const row = byMember[uid] && typeof byMember[uid] === "object" ? { ...byMember[uid] } : {};
  const total = floorPts(row.total);
  const memberPeriods = row.byPeriod && typeof row.byPeriod === "object" ? { ...row.byPeriod } : {};
  const totals = raw.totals && typeof raw.totals === "object" ? { ...raw.totals } : {};
  const periods = raw.byPeriod && typeof raw.byPeriod === "object" ? { ...raw.byPeriod } : {};

  if (total > 0) {
    totals[from] = floorPts((totals[from] || 0) - total);
    totals[to] = floorPts((totals[to] || 0) + total);
  }
  for (const [pk, ptsRaw] of Object.entries(memberPeriods)) {
    const pts = floorPts(ptsRaw);
    if (!pts) continue;
    const periodRow = periods[pk] && typeof periods[pk] === "object" ? { ...periods[pk] } : {};
    periodRow[from] = floorPts((periodRow[from] || 0) - pts);
    periodRow[to] = floorPts((periodRow[to] || 0) + pts);
    periods[pk] = periodRow;
  }
  byMember[uid] = { ...row, houseId: to, total, byPeriod: memberPeriods };

  await SiteDocument.updateOne(
    { _id: doc._id },
    {
      $set: {
        "rawWebhook.totals": totals,
        "rawWebhook.byPeriod": periods,
        [`rawWebhook.byMember.${uid}`]: byMember[uid],
      },
    },
  );
  return { movedTotal: total, fromHouseId: from, toHouseId: to };
}

async function transferSortedMemberToHouse(client?, guild?, targetUserId?, targetHouseId?, options: Record<string, any> = {}) {
  const gid = String(guild?.id || "").trim();
  const uid = String(targetUserId || "").trim();
  const toHouse = normalizeHouseInput(targetHouseId);
  const announce = options.announce !== false;
  if (!client || !gid || !uid || !toHouse) return { ok: false, code: "bad_input" };

  const eventCfg = resolveHogwartsEventConfig(client);
  const eventKey = String(eventCfg?.eventKey || "").trim();
  const doc = await findSortingDoc(gid, uid, eventKey);
  const fromHouse = resolveSortedHouseId(doc);
  if (!doc || !fromHouse) return { ok: false, code: "not_sorted" };
  const alreadyThere = fromHouse === toHouse;
  if (alreadyThere && !options.force) {
    return { ok: false, code: "already_there", houseId: toHouse, houseLabel: houseLabel(toHouse, eventCfg) };
  }

  let points = { movedTotal: 0, skipped: alreadyThere };
  if (!alreadyThere) {
    await SiteDocument.updateMany(
      { docType: SORTING_DOC, guildId: gid, userId: uid },
      {
        $set: {
          status: toHouse,
          planKey: toHouse,
          houseId: toHouse,
          house: toHouse,
          "rawWebhook.houseId": toHouse,
        },
        $unset: { houseAnnounceAt: "", houseAnnounceHouseId: "" },
      },
    );
    revokeHouseSortingAnnouncesForMember({ guildId: gid, userId: uid, eventKey });
    points = await transferMemberHousePointsContribution(gid, eventKey, uid, fromHouse, toHouse).catch((err?) => {
      global.logger?.warn?.("[hogwarts-house-transfer] points:", err?.message || err);
      return { movedTotal: 0, error: String(err?.message || err) };
    });
  } else {
    await SiteDocument.updateMany(
      { docType: SORTING_DOC, guildId: gid, userId: uid },
      { $unset: { houseAnnounceAt: "", houseAnnounceHouseId: "" } },
    );
    revokeHouseSortingAnnouncesForMember({ guildId: gid, userId: uid, eventKey });
  }

  const member = guild?.members?.cache?.get(uid) || (await guild?.members?.fetch(uid).catch(() => null));
  let roles = { roleAssigned: false };
  if (member) {
    try {
      roles = await assignHouseRoles(member, eventCfg, toHouse);
    } catch (err) {
      roles = { roleAssigned: false, roleError: String(err?.message || err).slice(0, 200) };
    }
  }

  let announced = { ok: false, skipped: !announce };
  if (announce) {
    announced = await logHogwartsSortingCompleted({
      client,
      guild,
      cfg: eventCfg,
      member,
      userId: uid,
      houseId: toHouse,
      houseLabel: houseLabel(toHouse, eventCfg),
    }).catch((err?) => {
      global.logger?.warn?.("[hogwarts-house-transfer] announce:", err?.message || err);
      return { ok: false, error: String(err?.message || err) };
    });
  }

  return {
    ok: true,
    userId: uid,
    fromHouseId: fromHouse,
    fromHouseLabel: houseLabel(fromHouse, eventCfg),
    toHouseId: toHouse,
    toHouseLabel: houseLabel(toHouse, eventCfg),
    movedHousePoints: Number(points?.movedTotal || 0),
    roles,
    announced: Boolean(announced?.ok),
    memberFound: Boolean(member),
    forced: Boolean(alreadyThere && options.force),
  };
}

export = {
  fetchHouseDashboardData,
  expelSortedMemberFromHouse,
  transferSortedMemberToHouse,
  countSortedMembersInHouse,
  fetchSortedHouseMemberDocs,
  formatRankLabel,
  houseLabel,
};