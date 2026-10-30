"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");

const HALLOWEEN_SHOWCASE_DEDUPE = "halloween_minigames_showcase_force_v1";
const halloweenShowcaseRunning = new WeakSet();

/** Iniettato da minigameService per evitare circular require a load. */
let deps = null;

function registerHalloweenShowcaseDeps(next?) {
  deps = next;
  return deps;
}

async function processHalloweenMinigamesShowcaseForce(client?) {
  if (!deps || !client || halloweenShowcaseRunning.has(client)) return;
  const {
    getConfig,
    clearGameForChannel,
    clearActiveGame,
    startHalloweenTrickOrTreatGame,
    safeStartGameByType,
    getChannelCached,
    normalizeRewardExp,
    buildPromptImageAttachment,
    buildFindBotEmbed,
    formatItalianMinutesBold,
    sendMinigameRolePing,
    sendMinigameMessage,
    buildHalloweenFindGhostFoundEmbed,
    warnMinigame,
  } = deps;

  let doc = null;
  try {
    const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
    doc = await SiteDocument.findOne({
      docType: SITE_DOCUMENT_TYPE.HOGWARTS_REACT_PRESS,
      dedupeKey: HALLOWEEN_SHOWCASE_DEDUPE,
      "rawWebhook.pending": true,
    })
      .lean()
      .catch(() => null);
  } catch (_) {
    return;
  }
  if (!doc?.rawWebhook?.pending) return;
  halloweenShowcaseRunning.add(client);

  const raw = doc.rawWebhook || {};
  const guildId = String(raw.guildId || "").trim();
  const channelId = String(raw.channelId || "").trim();
  const types = Array.isArray(raw.types) ? raw.types.map((t?) => String(t || "").trim()).filter(Boolean) : [];
  const holdMs = Math.max(2500, Math.min(15000, Number(raw.holdMs || 4000)));
  const includeHunt = raw.includeHunt !== false;

  try {
    const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
    await SiteDocument.findOneAndUpdate(
      { guildId: doc.guildId, docType: SITE_DOCUMENT_TYPE.HOGWARTS_REACT_PRESS, dedupeKey: HALLOWEEN_SHOWCASE_DEDUPE },
      { $set: { "rawWebhook.pending": false, "rawWebhook.startedAtMs": Date.now(), updatedAt: new Date() } },
    ).catch(() => null);

    if (!guildId || !channelId || !types.length) {
      global.logger?.warn?.("[MINIGAMES] halloween showcase: missing guild/channel/types");
      return;
    }

    const baseCfg = getConfig(client);
    const showcaseCfg = {
      ...baseCfg,
      channelId,
      guildId,
      halloweenEventLive: true,
      halloweenExclusiveDuringEvent: true,
      halloweenQuiz: { ...(baseCfg.halloweenQuiz || {}), durationMs: 120000 },
      halloweenMissingEmoji: { ...(baseCfg.halloweenMissingEmoji || {}), durationMs: 120000 },
      halloweenCountBats: { ...(baseCfg.halloweenCountBats || {}), durationMs: 120000 },
      halloweenFindGhost: { ...(baseCfg.halloweenFindGhost || {}), durationMs: 120000 },
      halloweenTrickOrTreat: { ...(baseCfg.halloweenTrickOrTreat || {}), durationMs: 120000 },
      hangman: { ...(baseCfg.hangman || {}), durationMs: 120000 },
      guessYear: { ...(baseCfg.guessYear || {}), durationMs: 120000 },
      completeVerse: { ...(baseCfg.completeVerse || {}), durationMs: 120000 },
      memoryEmoji: { ...(baseCfg.memoryEmoji || {}), durationMs: 120000, displayMs: 5000 },
    };

    const results = [];
    const sleep = (ms?) => new Promise((r?) => setTimeout(r, ms));

    for (const type of types) {
      try {
        clearGameForChannel(channelId, client, guildId);
        await clearActiveGame(client, showcaseCfg).catch(() => {});
        await sleep(600);
        let started = false;
        let note = null;
        if (type === "halloweenTrickOrTreat") {
          started = Boolean(await startHalloweenTrickOrTreatGame(client, showcaseCfg, { skipAlternate: true }));
        } else {
          const out = await safeStartGameByType(client, showcaseCfg, type);
          started = out === true || out?.started === true;
        }
        if (!started && type === "halloweenFindGhost") {
          try {
            const ch = await getChannelCached(client, channelId);
            if (ch?.send) {
              const rewardExp = normalizeRewardExp(showcaseCfg?.halloweenFindGhost?.rewardExp ?? 200);
              const durationMs = Math.max(60000, Number(showcaseCfg?.halloweenFindGhost?.durationMs || 120000));
              const findBotAttachment = buildPromptImageAttachment(
                "Trova il fantasma",
                ["Cerca il messaggio nascosto in un canale del server.", "Clicca il pulsante quando lo trovi!"],
                "halloween_find_ghost",
                "",
                client,
                false,
              );
              const embed = buildFindBotEmbed(rewardExp, durationMs)
                .setTitle("Trova il fantasma 👻")
                .setDescription(
                  [
                    `<:VC_Halloween:1558964785113206824> Un fantasma si è nascosto in un canale del server!`,
                    `<:VC_EXP:1482534670896730143> Chi lo trova vince **${rewardExp} exp**.`,
                    `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(Math.max(1, Math.round(durationMs / 60000)))} per cercarlo.`,
                  ].join("\n"),
                );
              if (findBotAttachment) embed.setImage(`attachment://${findBotAttachment.name}`);
              await sendMinigameRolePing(ch, showcaseCfg);
              await sendMinigameMessage(ch, {
                embeds: [embed],
                files: findBotAttachment ? [findBotAttachment] : [],
              }).catch(() => null);
              const previewRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`minigame_findghost:preview:${Date.now()}`)
                  .setEmoji("<:VC_Halloween:1558964785113206824>")
                  .setLabel("Ho trovato il fantasma!")
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(true),
              );
              await sendMinigameMessage(ch, {
                content: "_Preview messaggio nascosto (sul test non c’è canale hide)_",
                embeds: [buildHalloweenFindGhostFoundEmbed(rewardExp, durationMs)],
                components: [previewRow],
              }).catch(() => null);
              started = true;
              note = "announce_only_no_hide_channel";
            }
          } catch (err) {
            warnMinigame(err);
          }
        }
        results.push({ type, ok: Boolean(started), ...(note ? { note } : {}) });
        global.logger?.info?.("[MINIGAMES] halloween showcase", { type, ok: Boolean(started), channelId, note });
        await sleep(holdMs);
        clearGameForChannel(channelId, client, guildId);
        await clearActiveGame(client, showcaseCfg).catch(() => {});
      } catch (err) {
        results.push({ type, ok: false, err: err?.message || String(err) });
        warnMinigame(err);
      }
    }

    if (includeHunt) {
      try {
        const hunt = require("../Community/halloweenEmojiHuntService") as typeof import("../Community/halloweenEmojiHuntService");
        const huntCfg = hunt.getHalloweenEmojiHuntConfig(client);
        const huntOut = await hunt.spawnHunt(
          client,
          { ...huntCfg, activeDurationMs: Math.min(Number(huntCfg.activeDurationMs || 900000), 180000) },
          guildId,
          `showcase:${Date.now()}`,
          channelId,
          { skipAlternate: true },
        );
        results.push({ type: "halloweenEmojiHunt", ok: Boolean(huntOut?.ok) });
      } catch (err) {
        results.push({ type: "halloweenEmojiHunt", ok: false, err: err?.message || String(err) });
        warnMinigame(err);
      }
    }

    await SiteDocument.findOneAndUpdate(
      { guildId: doc.guildId, docType: SITE_DOCUMENT_TYPE.HOGWARTS_REACT_PRESS, dedupeKey: HALLOWEEN_SHOWCASE_DEDUPE },
      { $set: { "rawWebhook.results": results, "rawWebhook.finishedAtMs": Date.now(), updatedAt: new Date() } },
    ).catch(() => null);
  } finally {
    halloweenShowcaseRunning.delete(client);
  }
}

export = {
  HALLOWEEN_SHOWCASE_DEDUPE,
  registerHalloweenShowcaseDeps,
  processHalloweenMinigamesShowcaseForce,
};
