const { accountUsername } = require("../../../../shared/discord/guildDiscordIdentity") as typeof import("../../../../shared/discord/guildDiscordIdentity");
const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { STAFF_WARN_THREE_NEGATIVES_REASON } = require("../../../Staff/services/staffWarnService") as typeof import("../../../Staff/services/staffWarnService");
const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const {
  makeRemovalEmbed,
  sendChannelEmbed,
  getValutazioneEntry,
  removeLinkedAutoValutazioneEntry,
  markLinkedAutoValutazioneSpentByTrade,
  removeValutazioneEntry,
  editOriginalValutazioneMessage,
} = require("./shared") as typeof import("./shared");

function actorFromMember(member?) {
  if (!member?.user) return { user: member, member: null };
  return { user: member.user, member };
}

function memberIsHighStaffOrAbove(member?) {
  const cache = member?.roles?.cache;
  if (!cache) return false;
  return Boolean(IDs.roles?.HighStaff && cache.has(IDs.roles.HighStaff));
}

async function removeOldestPositiveValutazioni(s?, count?, actor?, staffUser?, channel?, guild?, removalReason?, finalPosLabel?) {
  const posEdits = [];
  const n = Math.floor(Number(count || 0));
  for (let i = 0; i < n; i += 1) {
    const removedReason = s.positiveReasons[0];
    const originalEntry = getValutazioneEntry(s, "positive", 0, removedReason);
    s.positiveReasons.splice(0, 1);
    removeValutazioneEntry(s, "positive", 0);
    markLinkedAutoValutazioneSpentByTrade(s, originalEntry || { reason: removedReason }, removalReason);
    s.positiveCount = Math.max(0, s.positiveCount - 1);
    s.valutazioniCount = Math.max(0, s.valutazioniCount - 1);
    posEdits.push({ entry: originalEntry });
  }
  const finalPos = s.positiveCount;
  const title =
    n > 1
      ? `${E.cancel} **__${n} VALUTAZIONI POSITIVE RIMOSSE__** (scambio)`
      : `${E.cancel} **__VALUTAZIONE POSITIVA RIMOSSA__** (scambio)`;
  const body =
    n > 1
      ? `${E.VC_reason} A __${accountUsername(staffUser)}__ sono state **rimosse** **${n}** _Valutazioni Positive_ (scambio).`
      : `${E.VC_reason} A __${accountUsername(staffUser)}__ è stata **rimossa** una _Valutazione Positiva_ (scambio).`;
  const embed = makeRemovalEmbed(
    actor,
    staffUser,
    title,
    body,
    removalReason,
    `${E.VC_update} __Valutazioni Positive Totali__`,
    finalPosLabel(finalPos),
  );
  let anyEdited = false;
  let needChannelPost = false;
  for (const row of posEdits) {
    const edited = await editOriginalValutazioneMessage(guild, row.entry, embed);
    if (edited) anyEdited = true;
    else needChannelPost = true;
  }
    if (needChannelPost || !anyEdited) {
    await sendChannelEmbed(channel, { embeds: [embed] });
  }
  return { removed: n, finalPos };
}

function consumeOldestNegativesFromStaff(s?, count?) {
  if (!s || !Array.isArray(s.negativeReasons)) {
    return { removed: 0, finalNeg: 0, entries: [], reasons: [] };
  }
  const n = Math.min(
    Math.max(0, Math.floor(Number(count || 0))),
    s.negativeReasons.length,
  );
  if (n <= 0) {
    return {
      removed: 0,
      finalNeg: Math.max(0, Math.floor(Number(s.negativeCount) || 0)),
      entries: [],
      reasons: [],
    };
  }

  const entries = [];
  const reasons = [];
  for (let i = 0; i < n; i += 1) {
    const removedReason = s.negativeReasons[0];
    const originalEntry = getValutazioneEntry(s, "negative", 0, removedReason);
    reasons.push(String(removedReason || ""));
    entries.push(originalEntry || null);
    s.negativeReasons.splice(0, 1);
    removeValutazioneEntry(s, "negative", 0);
    removeLinkedAutoValutazioneEntry(s, originalEntry);
    s.negativeCount = Math.max(0, Math.floor(Number(s.negativeCount) || 0) - 1);
    s.valutazioniCount = Math.max(0, Math.floor(Number(s.valutazioniCount) || 0) - 1);
  }

  return {
    removed: n,
    finalNeg: Math.max(0, Math.floor(Number(s.negativeCount) || 0)),
    entries,
    reasons,
  };
}

async function convertOldestNegativesToStaffWarn(s?, count?, actor?, staffUser?, channel?, guild?) {
  const consumed = consumeOldestNegativesFromStaff(s, count);
  if (consumed.removed <= 0) return { removed: 0, finalNeg: consumed.finalNeg };

  const n = consumed.removed;
  const finalNeg = consumed.finalNeg;
  const embed = makeRemovalEmbed(
    actor,
    staffUser,
    `${E.cancel} **__${n} VALUTAZIONI NEGATIVE CONVERTITE__**`,
    `${E.VC_reason} A __${accountUsername(staffUser)}__ sono state **convertite** **${n}** _Valutazioni Negative_ in un **warn staff**.`,
    STAFF_WARN_THREE_NEGATIVES_REASON,
    `${E.VC_update} __Valutazioni Negative Totali__`,
    `${E.VC_OnlineStatus} Ora sei a \`${finalNeg}\` valutazioni negative!`,
  );

  let anyEdited = false;
  let needChannelPost = false;
  for (const entry of consumed.entries) {
    const edited = await editOriginalValutazioneMessage(guild, entry, embed);
    if (edited) anyEdited = true;
    else needChannelPost = true;
  }
  if (needChannelPost || !anyEdited) {
    await sendChannelEmbed(channel, { embeds: [embed] });
  }
  return { removed: n, finalNeg };
}

export = {
  actorFromMember,
  memberIsHighStaffOrAbove,
  removeOldestPositiveValutazioni,
  consumeOldestNegativesFromStaff,
  convertOldestNegativesToStaffWarn,
};
