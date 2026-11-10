/** Invio embed boost nel canale supporters + aggiornamento slot / ruolo Double Booster. */
const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getAnnouncedBoostSlots, setAnnouncedBoostSlots, persistAnnouncedBoostSlotsToDb } = require("../utils/boostSlotAnnounceTracker") as typeof import("../utils/boostSlotAnnounceTracker");
const { buildBoostPayload, buildBoostPayloadSecond, buildBoostAnnounceContent } = require("../utils/boostAnnounceEmbeds") as typeof import("../utils/boostAnnounceEmbeds");
const { sleep } = require("./memberUpdateLogs") as typeof import("./memberUpdateLogs");

async function sendBoostEmbeds(channel?, member?, times?, boostCount?, priorAnnouncedSlots = 0, opts: Record<string, any> = {}) {
  if (!channel?.isTextBased?.()) return 0;
  const safeTimes = Math.max(0, Number(times || 0));
  const start = Math.max(0, Math.floor(Number(priorAnnouncedSlots || 0)));
  if (safeTimes <= 0) return 0;

  /* annunciBoost1: annuncio acceso nella dashboard → stessi controlli di sempre, testi e canale della dashboard */
  try {
    const A = require("../../../MultiGuild/services/announcementsRuntime") as typeof import("../../../MultiGuild/services/announcementsRuntime");
    if (member?.guild?.id && (await A.boostModuleEnabled(member.guild.id))) {
      const collapse = Boolean(opts.confirmedDoubleBurst) && start < 2 && start + safeTimes >= 2;
      const sends = collapse ? [{ slot: 1, count: Math.max(1, Number(boostCount || 0)) }] : Array.from({ length: safeTimes }, (_, i) => ({ slot: start + i, count: Math.max(1, Number(boostCount || 0) - (safeTimes - i - 1)) }));
      let sentCount = 0;
      for (const [i, x] of sends.entries()) {
        const sent = await A.sendBoostAnnouncement(member.client, member.guild, member, { repeat: x.slot >= 1, boostCount: x.count, channelId: String(channel.id) });
        if (!sent) break;
        sentCount += collapse ? Math.max(0, 2 - start) : 1;
        if (i + 1 < sends.length) await sleep(350);
      }
      return sentCount;
    }
  } catch (err) {
    global.logger?.warn?.("[guildMemberUpdate] boost dashboard:", err?.message || err);
  }

  const endExclusive = start + safeTimes;
  /* boostFalseDouble3: collapse a un solo DOPPIO SOLO se il nativo è davvero "2 volte"
     (altrimenti start=0+times=2 mandava DOPPIO e bloccava il 2° boost reale). */
  const confirmedDoubleBurst = Boolean(opts.confirmedDoubleBurst);
  if (confirmedDoubleBurst && start < 2 && endExclusive >= 2) {
    const boostPayload = buildBoostPayloadSecond(member, Math.max(1, Number(boostCount || 0)));
    const sent = await channel
      .send({
        ...boostPayload,
        content: buildBoostAnnounceContent(member.user),
      })
      .catch((err?) => {
        global.logger?.warn?.(
          "[guildMemberUpdate] boost embed send failed:",
          member?.id,
          err?.message || err,
        );
        return null;
      });
    if (!sent?.id) return 0;
    return Math.max(0, 2 - start);
  }

  let sentCount = 0;
  for (let i = 0; i < safeTimes; i += 1) {
    const slotIndex = start + i;
    const remainingInBatch = safeTimes - i - 1;
    const countForEmbed = Math.max(1, Number(boostCount || 0) - remainingInBatch);
    const boostPayload =
      slotIndex >= 1
        ? buildBoostPayloadSecond(member, countForEmbed)
        : buildBoostPayload(member, countForEmbed);
    const sent = await channel
      .send({
        ...boostPayload,
        content: buildBoostAnnounceContent(member.user),
      })
      .catch((err?) => {
        global.logger?.warn?.(
          "[guildMemberUpdate] boost embed send failed:",
          member?.id,
          err?.message || err,
        );
        return null;
      });
    if (!sent?.id) break;
    sentCount += 1;
    if (i + 1 < safeTimes) await sleep(350);
  }
  return sentCount;
}

async function trackBoostSlotsAnnouncedAndMaybeGrantDoubleBooster(member?, guildId?, nextCount?) {
  const mainId = String(IDs.guilds.main || "");
  if (!mainId || String(member?.guild?.id || "") !== mainId) return;
  if (member.user?.bot) return;
  const next = Math.min(2, Math.max(0, Math.floor(Number(nextCount || 0))));
  setAnnouncedBoostSlots(guildId, member.id, next);
  await persistAnnouncedBoostSlotsToDb(guildId, member.id).catch(() => null);

  const doubleId = IDs?.roles?.DoubleBooster;
  if (!doubleId || !member?.roles?.add) return;
  const me = member.guild.members.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;
  const role = member.guild.roles.cache.get(doubleId);
  if (!role || role.position >= me.roles.highest.position) return;
  if (next < 2 || member.roles.cache.has(doubleId)) return;
  /* boostFalseDouble1: ruolo solo se gli slot persistiti sono davvero ≥2 (non solo nextCount di passaggio) */
  const persisted = getAnnouncedBoostSlots(guildId, member.id);
  if (persisted < 2) return;
  const ok = await member.roles.add(doubleId).then(() => true).catch(() => false);
  if (!ok) {
    global.logger?.warn?.("[guildMemberUpdate] Double Booster add failed:", member.guild.id, member.id);
  }
}

export = { sendBoostEmbeds, trackBoostSlotsAnnouncedAndMaybeGrantDoubleBooster };
