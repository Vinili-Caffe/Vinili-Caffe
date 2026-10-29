"use strict";

const { GlobalSettings } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const Embeds = require("../../Embeds") as typeof import("../../Embeds");
const {
  getEnabledDiscordPanelNames,
  isDiscordPanelEnabled,
  siteReplacesForPanel,
} = require("../../Utils/Config/discordPanelsConfig") as typeof import("../../Utils/Config/discordPanelsConfig");

const MAIN_GUILD_ID = String(IDs.guilds?.main || "1329080093599076474");

const PANEL_CHANNEL_RESOLVERS = {
  info: () => String(IDs.channels?.info || "").trim() || null,
  sanzioni: () => String(IDs.channels?.sanzioniUtenti || "").trim() || null,
  ruoli: () => String(IDs.channels?.ruoliColori || "").trim() || null,
  ticket: () => String(IDs.channels?.ticket || IDs.channels?.tickets || "").trim() || null,
  verify: () => String(IDs.channels?.verify || "").trim() || null,
  candidature: () => String(IDs.channels?.candidatureStaff || "").trim() || null,
  pause: () => String(IDs.channels?.pause || "").trim() || null,
  staff: () => String(IDs.channels?.guidaStaff || IDs.channels?.guidaMid || "").trim() || null,
  staffList: () => String(IDs.channels?.staffList || "").trim() || null,
};

const DISABLED_MESSAGE_SLOT_KEYS = Object.freeze([
  "personalityMessageId",
  "dmPanelMessageId",
  "mentionsMessageId",
  "colorsMessageId",
  "plusColorsMessageId",
  "verifyInfoMessageId",
  "verifyPanelMessageId",
  "ticketInfoMessageId",
  "ticketPanelMessageId",
  "sponsorTicketPanelMessageId",
  "pausePanelMessageId",
]);

function resolveChannelIdForPanel(name?) {
  const fn = PANEL_CHANNEL_RESOLVERS[String(name || "")];
  return typeof fn === "function" ? fn() : null;
}

function collectMessageSlotsFromPanels(personalityPanels?) {
  const byChannel: Record<string, any> = {};
  for (const row of Array.isArray(personalityPanels) ? personalityPanels : []) {
    const cid = String(row?.channelId || "").trim();
    if (!cid) continue;
    const slots: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      if (/MessageId/i.test(k) && v) slots[k] = String(v);
    }
    if (Object.keys(slots).length) byChannel[cid] = slots;
  }
  return byChannel;
}

function enabledFingerprint(names = getEnabledDiscordPanelNames()) {
  return [...names].map(String).sort().join(",");
}

function recipesComparableSnapshot(payload?) {
  if (!payload || typeof payload !== "object") return "";
  return JSON.stringify({
    schemaVersion: payload.schemaVersion || 1,
    enabledNames: [...(payload.enabledNames || [])].map(String).sort(),
    recipes: (payload.recipes || []).map((r?) => ({
      name: r.name,
      section: r.section,
      order: r.order,
      enabled: Boolean(r.enabled),
      channelId: r.channelId || null,
      siteReplaces: r.siteReplaces ?? null,
      messageSlots: r.messageSlots || {},
    })),
  });
}

function countDirtyDisabledSlots(personalityPanels?) {
  const mainInfoChannelId = String(IDs.channels?.info || "").trim();
  const sanzioniChannelId = String(IDs.channels?.sanzioniUtenti || "").trim();
  const sponsorDisabled = !isDiscordPanelEnabled("sponsor");
  let dirty = 0;
  for (const row of Array.isArray(personalityPanels) ? personalityPanels : []) {
    const channelId = String(row?.channelId || "").trim();
    const keysToClear = [...DISABLED_MESSAGE_SLOT_KEYS];
    if (sponsorDisabled && channelId && channelId !== mainInfoChannelId) {
      keysToClear.push("infoGifMessageId", "infoMessageId1", "infoMessageId2");
    }
    for (const key of keysToClear) {
      const mid = String(row?.[key] || "").trim();
      if (!mid) continue;
      if (key === "sanzioniPanelMessageId" && channelId === sanzioniChannelId) continue;
      if (
        (key === "infoGifMessageId" || key === "infoMessageId1" || key === "infoMessageId2") &&
        channelId === mainInfoChannelId
      ) {
        continue;
      }
      if (
        (key === "verifyPanelMessageId" || key === "verifyInfoMessageId") &&
        isDiscordPanelEnabled("sponsorVerify")
      ) {
        continue;
      }
      if (key === "sponsorTicketPanelMessageId" && isDiscordPanelEnabled("sponsorTicket")) {
        continue;
      }
      dirty += 1;
    }
  }
  return dirty;
}

async function persistDiscordPanelRecipes(extra: Record<string, any> = {}) {
  Embeds.loadPanels();
  const meta = Embeds.listAllPanelMeta();
  const doc = await GlobalSettings.findOne({ guildId: MAIN_GUILD_ID })
    .select("personalityPanels discordPanelRecipes")
    .lean()
    .catch(() => null);
  const slotsByChannel = collectMessageSlotsFromPanels(doc?.personalityPanels);
  const enabledNames = getEnabledDiscordPanelNames();

  const recipes = meta.map((p?) => {
    const channelId = resolveChannelIdForPanel(p.name);
    return {
      name: p.name,
      section: p.section,
      order: p.order,
      enabled: Boolean(p.enabled),
      channelId,
      siteReplaces: siteReplacesForPanel(p.name),
      messageSlots: channelId && slotsByChannel[channelId] ? slotsByChannel[channelId] : {},
    };
  });

  const nextCore = {
    schemaVersion: 1,
    enabledNames,
    recipes,
    note: "Discord auto-publish allowlist. Site flows remain active for disabled panels.",
    cleanupFingerprint: enabledFingerprint(enabledNames),
  };

  const prev = doc?.discordPanelRecipes || null;
  const unchanged =
    recipesComparableSnapshot(prev) === recipesComparableSnapshot(nextCore) &&
    String(prev?.cleanupFingerprint || "") === String(nextCore.cleanupFingerprint);

  if (unchanged && extra.force !== true) {
    return { ...prev, skipped: true, unchanged: true };
  }

  const payload: Record<string, any> = {
    ...nextCore,
    updatedAt: new Date(),
    ...extra,
  };
  delete payload.force;

  await GlobalSettings.updateOne(
    { guildId: MAIN_GUILD_ID },
    { $set: { discordPanelRecipes: payload }, $setOnInsert: { guildId: MAIN_GUILD_ID } },
    { upsert: true },
  ).catch(() => null);

  return { ...payload, skipped: false, unchanged: false };
}

async function deleteMessageSafe(client?, channelId?, messageId?) {
  const cid = String(channelId || "").trim();
  const mid = String(messageId || "").trim();
  if (!cid || !mid || !client) return false;
  try {
    const ch =
      client.channels.cache.get(cid) ||
      (await client.channels.fetch(cid).catch(() => null));
    if (!ch?.messages?.fetch) return false;
    const msg = await ch.messages.fetch(mid).catch(() => null);
    if (!msg) return false;
    await msg.delete().catch(() => null);
    return true;
  } catch {
    return false;
  }
}

/**
 * Rimuove sticky dei pannelli disabilitati. Skip se allowlist già pulita e nessuno slot sporco.
 */
async function cleanupDisabledDiscordPanelMessages(client?, options: Record<string, any> = {}) {
  if (!client) return { deleted: 0, clearedSlots: 0, skipped: true };

  const force = options.force === true;
  const fp = enabledFingerprint();
  const doc = await GlobalSettings.findOne({ guildId: MAIN_GUILD_ID })
    .select("personalityPanels discordPanelRecipes")
    .lean()
    .catch(() => null);
  const prevFp = String(doc?.discordPanelRecipes?.cleanupFingerprint || "");
  const dirty = countDirtyDisabledSlots(doc?.personalityPanels);
  if (!force && prevFp === fp && dirty === 0) {
    return { deleted: 0, clearedSlots: 0, skipped: true, reason: "already_clean" };
  }

  const mainInfoChannelId = String(IDs.channels?.info || "").trim();
  const sanzioniChannelId = String(IDs.channels?.sanzioniUtenti || "").trim();
  const sponsorDisabled = !isDiscordPanelEnabled("sponsor");

  const panels = Array.isArray(doc?.personalityPanels) ? [...doc.personalityPanels] : [];
  let deleted = 0;
  let clearedSlots = 0;
  let changed = false;

  for (let i = 0; i < panels.length; i += 1) {
    const row = { ...panels[i] };
    const channelId = String(row.channelId || "").trim();
    const keysToClear = [...DISABLED_MESSAGE_SLOT_KEYS];
    if (sponsorDisabled && channelId && channelId !== mainInfoChannelId) {
      keysToClear.push("infoGifMessageId", "infoMessageId1", "infoMessageId2");
    }
    for (const key of keysToClear) {
      const mid = String(row[key] || "").trim();
      if (!mid) continue;
      if (key === "sanzioniPanelMessageId" && channelId === sanzioniChannelId) continue;
      if (
        (key === "infoGifMessageId" || key === "infoMessageId1" || key === "infoMessageId2") &&
        channelId === mainInfoChannelId
      ) {
        continue;
      }
      if (
        (key === "verifyPanelMessageId" || key === "verifyInfoMessageId") &&
        isDiscordPanelEnabled("sponsorVerify")
      ) {
        continue;
      }
      if (key === "sponsorTicketPanelMessageId" && isDiscordPanelEnabled("sponsorTicket")) {
        continue;
      }
      const ok = await deleteMessageSafe(client, channelId, mid);
      if (ok) deleted += 1;
      row[key] = null;
      clearedSlots += 1;
      changed = true;
    }
    panels[i] = row;
  }

  if (changed) {
    await GlobalSettings.updateOne(
      { guildId: MAIN_GUILD_ID },
      { $set: { personalityPanels: panels } },
    ).catch(() => null);
  }

  // Legacy collection (pre-migration)
  try {
    const mongoose = require("mongoose") as typeof import("mongoose");
    const legacy = mongoose.connection?.db?.collection("personalitypanels");
    if (legacy) {
      const rows = await legacy.find({ guildId: MAIN_GUILD_ID }).toArray();
      for (const row of rows) {
        const channelId = String(row.channelId || "").trim();
        const unset: Record<string, any> = {};
        const keysToClear = [...DISABLED_MESSAGE_SLOT_KEYS];
        if (sponsorDisabled && channelId && channelId !== mainInfoChannelId) {
          keysToClear.push("infoGifMessageId", "infoMessageId1", "infoMessageId2", "infoMessageId");
        }
        for (const key of keysToClear) {
          const mid = String(row[key] || "").trim();
          if (!mid) continue;
          if (key === "sanzioniPanelMessageId" && channelId === sanzioniChannelId) continue;
          if (
            (key === "infoGifMessageId" || key === "infoMessageId1" || key === "infoMessageId2" || key === "infoMessageId") &&
            channelId === mainInfoChannelId
          ) {
            continue;
          }
          if (
            (key === "verifyPanelMessageId" || key === "verifyInfoMessageId") &&
            isDiscordPanelEnabled("sponsorVerify")
          ) {
            continue;
          }
          if (key === "sponsorTicketPanelMessageId" && isDiscordPanelEnabled("sponsorTicket")) {
            continue;
          }
          const ok = await deleteMessageSafe(client, channelId, mid);
          if (ok) deleted += 1;
          unset[key] = "";
          clearedSlots += 1;
        }
        if (Object.keys(unset).length) {
          await legacy.updateOne({ _id: row._id }, { $unset: unset }).catch(() => null);
        }
      }
    }
  } catch {
    /* ignore */
  }

  // Mark allowlist as cleaned even if nothing left to delete (idempotent).
  await GlobalSettings.updateOne(
    { guildId: MAIN_GUILD_ID },
    {
      $set: {
        "discordPanelRecipes.cleanupFingerprint": fp,
        "discordPanelRecipes.cleanupAt": new Date(),
      },
      $setOnInsert: { guildId: MAIN_GUILD_ID },
    },
    { upsert: true },
  ).catch(() => null);

  return { deleted, clearedSlots, skipped: false, fingerprint: fp };
}

export = {
  persistDiscordPanelRecipes,
  cleanupDisabledDiscordPanelMessages,
  DISABLED_MESSAGE_SLOT_KEYS,
};
