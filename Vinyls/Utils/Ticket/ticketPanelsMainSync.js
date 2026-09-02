const IDs = require("../Config/ids");
const {
  getGuildPanels,
  mutateGuildPanels,
  normalizeSingle,
  normalizeMulti,
  newPanelId,
} = require("../../MultiGuild/core/tenantTicketPanels");
const { getTicketSettingsSync, refreshTicketConfigCache } = require("../../MultiGuild/core/tenantTicketSettings");
const { GlobalSettings } = require("../../Schemas/Community/communitySchemas");
const { publishMultiPanel, DEFAULT_OPTION_META } = require("./ticketPanelPublishRuntime");
const { guildIconUrl } = require("../Discord/guildDiscordIdentity");
const { isWelcomeEmpty, defaultWelcomeForTicketType } = require("./ticketPanelOptions");

const MAIN_MULTI_SEED = "main:legacy-multipanel";

const MAIN_PANEL_DEFS = [
  {
    seedKey: "main:supporto",
    ticketType: "supporto",
    title: "SUPPORTO",
    content:
      "Usalo per fare segnalazioni, riportare dei problemi o bug, per avere delle informazioni o per qualunque altra cosa che non rientra nelle categorie sottostanti.",
    buttonText: "SUPPORTO",
  },
  {
    seedKey: "main:partnership",
    ticketType: "partnership",
    title: "PARTNERSHIP",
    content: "Usalo per fare partnership con noi.",
    buttonText: "PARTNERSHIP",
  },
  {
    seedKey: "main:high",
    ticketType: "high",
    title: "HIGH STAFF",
    content: "Usalo per fare una donazione, per richiedere una sponsor a pagamento o per parlare con un amministratore del server.",
    buttonText: "HIGH STAFF",
  },
  {
    seedKey: "main:perks",
    ticketType: "perks",
    title: "PERKS",
    content: "Usalo per fare la verifica selfie o per riscattare i ruoli Supporter o Follower.",
    buttonText: "PERKS",
  },
];

const MAIN_MULTI_DESCRIPTION = `I ticket equivalgono a un sistema di supporto che permette di parlare direttamente con lo staff, al fine di chiedere chiarimenti, rivolgere domande sul server, segnalare un accaduto all'interno di quest'ultimo o per altre richieste.

<:VC_1:1482706338021642333> **SUPPORTO**
<a:VC_Arrow:1482706699365257397> Usalo per fare segnalazioni, riportare dei problemi o bug, per avere delle informazioni o per qualunque altra cosa che non rientra nelle categorie sottostanti.
<:VC_2:1482706376525611090> **PARTNERSHIP**
<a:VC_Arrow:1482706699365257397> Usalo per fare partnership con noi.
<:VC_3:1482706404773990460> **HIGH STAFF**
<a:VC_Arrow:1482706699365257397> Usalo per fare una donazione, per richiedere una sponsor a pagamento o per parlare con un amministratore del server.
<:VC_4:1482706432347344916> **PERKS**
<a:VC_Arrow:1482706699365257397> Usalo per fare la verifica selfie o per riscattare i ruoli Supporter o Follower.

<a:VC_Alert:1482706673176150077> Richieste di trasferimenti o fusioni noi da voi verranno sanzionate.
<a:VC_Alarm:1482706641618079816> Non accettiamo richieste di bot o siti, aprire ticket per ciò comporterà un warn.

<:VC_Attention:1482534443632558151> Aprire un ticket **__inutile__** oppure **__non rispondere__** nell'arco di **\`24\` ore** comporterà un **warn**.`;

function isMainGuild(guildId) {
  const main = String(IDs.guilds?.main || "").trim();
  return main && String(guildId || "").trim() === main;
}

async function ensureMainTicketPanelsSeeded(options = {}) {
  const mainGuildId = String(IDs.guilds?.main || "").trim();
  if (!mainGuildId) return { ok: false, reason: "missing_main_guild" };

  await refreshTicketConfigCache().catch(() => null);
  const settings = getTicketSettingsSync(mainGuildId);
  const panelChannelId = settings.panelChannelId || IDs.channels.ticket || null;
  const guild = options.client?.guilds?.cache?.get(mainGuildId) || null;
  const authorIconUrl = guild ? guildIconUrl(guild, { size: 128 }) : null;

  let existingMessageId = null;
  if (panelChannelId) {
    try {
      const doc = await GlobalSettings.findOne({ guildId: mainGuildId })
        .select("personalityPanels")
        .lean()
        .catch(() => null);
      const row = (doc?.personalityPanels || []).find(
        (x) => String(x.channelId || "") === String(panelChannelId),
      );
      existingMessageId = row?.ticketInfoMessageId ? String(row.ticketInfoMessageId) : null;
    } catch (_) {
      existingMessageId = null;
    }
  }

  const now = new Date().toISOString();
  const result = await mutateGuildPanels(mainGuildId, (prev) => {
    const singles = [...(prev.singles || [])];
    const bySeed = new Map(singles.filter((s) => s.seedKey).map((s) => [s.seedKey, s]));
    const ensuredIds = [];

    for (const def of MAIN_PANEL_DEFS) {
      const meta = DEFAULT_OPTION_META[def.ticketType] || {};
      const existing = bySeed.get(def.seedKey);
      if (existing) {
        const idx = singles.findIndex((s) => String(s.id) === String(existing.id));
        const needsChannel = Boolean(idx >= 0 && !existing.channelId && panelChannelId);
        const needsWelcome = Boolean(idx >= 0 && isWelcomeEmpty(existing.welcome));
        if (idx >= 0 && (needsChannel || needsWelcome)) {
          singles[idx] = normalizeSingle({
            ...existing,
            channelId: existing.channelId || panelChannelId,
            welcome: needsWelcome
              ? defaultWelcomeForTicketType(def.ticketType)
              : existing.welcome,
            updatedAt: now,
          });
        }
        ensuredIds.push(existing.id);
        continue;
      }
      const created = normalizeSingle({
        id: newPanelId(),
        seedKey: def.seedKey,
        ticketType: def.ticketType,
        title: def.title,
        content: def.content,
        color: "#6f4e37",
        channelId: panelChannelId,
        buttonStyle: "Primary",
        buttonText: def.buttonText,
        buttonEmoji: meta.emoji || null,
        welcome: defaultWelcomeForTicketType(def.ticketType),
        createdAt: now,
        updatedAt: now,
      });
      singles.push(created);
      ensuredIds.push(created.id);
    }

    const multis = [...(prev.multis || [])];
    const multiIdx = multis.findIndex((m) => m.seedKey === MAIN_MULTI_SEED);
    if (multiIdx >= 0) {
      const current = multis[multiIdx];
      multis[multiIdx] = normalizeMulti({
        ...current,
        panelIds: ensuredIds,
        channelId: current.channelId || panelChannelId,
        messageId: current.messageId || existingMessageId,
        updatedAt: now,
      });
    } else {
      multis.push(
        normalizeMulti({
          id: newPanelId(),
          seedKey: MAIN_MULTI_SEED,
          title: "",
          authorName: "Contatta lo Staff & chiedi supporto:",
          authorIconUrl: authorIconUrl || null,
          description: MAIN_MULTI_DESCRIPTION,
          color: "#6f4e37",
          channelId: panelChannelId,
          panelIds: ensuredIds,
          useDropdown: true,
          dropdownPlaceholder: "Seleziona un argomento...",
          footerText: "Non garantiamo di rispondere negli orari notturni, dalle 00:00 alle 10:00",
          messageId: existingMessageId,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }

    return {
      ...prev,
      singles,
      multis,
      syncedAt: now,
    };
  });

  if (!result.ok) return result;

  try {
    const { ensureMainTicketTeamsSeeded } = require("./ticketTeamsMainSync");
    await ensureMainTicketTeamsSeeded({ client: options.client }).catch(() => null);
  } catch (_) {}

  let published = null;
  if (options.publish !== false && options.client) {
    const multi = (result.bucket.multis || []).find((m) => m.seedKey === MAIN_MULTI_SEED);
    if (multi?.id && multi.channelId) {
      published = await publishMultiPanel(options.client, mainGuildId, multi.id, {
        attachTicketGif: true,
      });
    }
  }

  return {
    ok: true,
    guildId: mainGuildId,
    bucket: result.bucket,
    published,
  };
}

async function syncGuildTicketPanelsFromLegacy(client, guildId, options = {}) {
  if (isMainGuild(guildId)) {
    return ensureMainTicketPanelsSeeded({ client, publish: options.publish !== false });
  }
    const bucket = await getGuildPanels(guildId);
  return { ok: true, guildId: String(guildId), bucket, published: null };
}

module.exports = {
  MAIN_MULTI_SEED,
  MAIN_PANEL_DEFS,
  MAIN_MULTI_DESCRIPTION,
  isMainGuild,
  ensureMainTicketPanelsSeeded,
  syncGuildTicketPanelsFromLegacy,
};
