const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const IDs = require("../../Utils/Config/ids");

const DISCORD_CONTENT_MAX = 2000;
const TIME_ZONE = "Europe/Rome";

function normalizeId(value) {
  return String(value || "").trim();
}

function roleMention(roleId) {
  const id = normalizeId(roleId);
  return id ? `<@&${id}>` : "—";
}

function userMention(userId) {
  const id = normalizeId(userId);
  return id ? `<@${id}>` : "—";
}

function channelMention(channelId) {
  const id = normalizeId(channelId);
  return id ? `<#${id}>` : "—";
}

function houseRoleMention(cfg, houseId) {
  return roleMention(cfg?.houses?.[houseId]?.roleId);
}

function formatLotteryWhen(iso, timezone = TIME_ZONE) {
  const ms = Date.parse(String(iso || ""));
  if (!Number.isFinite(ms)) return "prossimamente";
  try {
    const date = new Date(ms);
    const day = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", timeZone: timezone }).format(date);
    const time = new Intl.DateTimeFormat("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).format(date);
    return `${day}, alle ore ${time}`;
  } catch (_) {
    return "prossimamente";
  }
}

function collectAllowedMentions(content, extra = {}) {
  const roles = new Set((extra.roles || []).map(normalizeId).filter(Boolean));
  const users = new Set((extra.users || []).map(normalizeId).filter(Boolean));
  const roleRe = /<@&(\d{17,22})>/g;
  const userRe = /<@(?![&!])(\d{17,22})>/g;
  let match;
  while ((match = roleRe.exec(content))) roles.add(match[1]);
  while ((match = userRe.exec(content))) users.add(match[1]);
  return { roles: [...roles], users: [...users] };
}

function splitDiscordContent(text, maxLen = DISCORD_CONTENT_MAX) {
  const body = String(text || "").trim();
  if (body.length <= maxLen) return [body];
  const parts = [];
  let rest = body;
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf("\n\n", maxLen);
    if (cut < maxLen * 0.45) cut = rest.lastIndexOf("\n", maxLen);
    if (cut < maxLen * 0.35) cut = maxLen;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts.filter(Boolean);
}

/**
 * @param {import("discord.js").Client} client
 * @param {object} cfg
 * @param {{ houseRanking: { houseId: string, points: number }[], memberTop: { userId: string, place: number }[] }} data
 */
function buildHogwartsFinaleAnnounceContent(client, cfg, data) {
  const ranked = Array.isArray(data?.houseRanking) ? data.houseRanking : [];
  const memberTop = Array.isArray(data?.memberTop) ? data.memberTop : [];
  const h1 = ranked[0]?.houseId || "";
  const h2 = ranked[1]?.houseId || "";
  const h3 = ranked[2]?.houseId || "";
  const u1 = memberTop.find((r) => r.place === 1) || memberTop[0];
  const u2 = memberTop.find((r) => r.place === 2) || memberTop[1];
  const u3 = memberTop.find((r) => r.place === 3) || memberTop[2];

  const vipPlus = roleMention(IDs.roles?.VIPplus);
  const vip = roleMention(IDs.roles?.VIP);
  const donator = roleMention(IDs.roles?.Donator);
  const winnerBonus = roleMention(cfg?.finaleWinnerHouseBonusRoleId || IDs.roles?.HogwartsFinaleWinnerBonus);
  const lotteryChannel = channelMention(
    cfg?.finaleLotteryChannelId || IDs.channels?.vocaleLounge1 || "1442569101225496819",
  );
  const lotteryWhen = formatLotteryWhen(cfg?.finaleLotteryAt, cfg?.timezone || TIME_ZONE);
  const winningHouse = houseRoleMention(cfg, h1);

  return [
    "# <a:VC_Rule:1482706839928967280> VERBALE DI HOGWARTS DEL MINISTERO DELLA MAGIA DI VINILI&CAFFÈ <a:VC_Rule:1482706839928967280>",
    "",
    "> <:VC_Hogwarts:1508766773837693061> Cari maghi, streghe e babbani onorari,",
    "",
    "il percorso ad Hogwarts per tutti voi termina qui, oggi. Lo Staff del Ministero della Magia di Vinili&Caffè vi ha osservato durante tutto il vostro percorso di studi ed è grato e onorato di condividere con voi l’esito di tutto il vostro, e nostro, lavoro. Come potete vedere nel tabellone della **[Coppa delle Casate](<https://www.viniliecaffe.it/evento/coppa/>)**, i vincitori si portano a casa i seguenti premi:",
    "",
    "**LE MIGLIORI CASATE**",
    `• <:VC_Podio1:1482694399283433582> **Primo posto**: ${vipPlus} per 30 giorni (valore 20€) + ${winnerBonus} __vinto dalla casata ${houseRoleMention(cfg, h1)}__`,
    `• <:VC_Podio2:1482694424411635712> **Secondo posto**: ${vip} per 30 giorni (valore 10€) __aggiudicato dai ${houseRoleMention(cfg, h2)}__`,
    `• <:VC_Podio3:1482694450806259744> **Terzo posto**: ${donator} per 30 giorni (valore 3€) __conseguito dai ${houseRoleMention(cfg, h3)}__`,
    "",
    "**I MIGLIORI UTENTI:**",
    `• <:VC_Podio1:1482694399283433582> **Primo posto**: ${userMention(u1?.userId)} si porta a casa un __Nitro Boost__ e la possibilità di creare un ruolo custom e una vocale personale per un mese (in caso di boost)`,
    `• <:VC_Podio2:1482694424411635712> **Secondo posto**: ${userMention(u2?.userId)} vince __Decorazione__ da max 15,99€ + ${vipPlus} per 30 giorni (valore 20€)`,
    `• <:VC_Podio3:1482694450806259744> **Terzo posto**: ${userMention(u3?.userId)} si guadagna __Nitro Basic__ + ${vip} per 30 giorni (valore 10€)`,
    "",
    `La casata migliore, ovvero ${winningHouse}, avrà in aggiunta una speciale estrazione dove uno tra tutti i casati potranno partecipare e vincere in aggiunta: __Nitro Boost__ e la possibilità di creare un ruolo custom e una vocale personale per un mese (in caso di boost). L’estrazione sarà effettuata ${lotteryWhen} con diretta in ${lotteryChannel}.`,
    "",
    "> Il primo evento stagionale di **Vinili&Caffè** giunge al termine ma stiamo già lavorando per la seconda season degli eventi stagionali del server. Hai idee su funzioni o temi da trattare? Diccelo scrivendoci tramite la pagina del nostro sito adibita ai [suggerimenti](https://www.viniliecaffe.it/suggerimenti)",
    "",
    "> <:VC_Mention:1482526855289634997> Seguici sui social per bonus improvvisi:",
    "- [Instagram](https://www.instagram.com/viniliecaffe)",
    "- [TikTok](https://www.tiktok.com/@viniliecaffe)",
    "",
    "— Lo Staff del Ministero della Magia di Vinili & Caffè",
    "",
    `<a:VC_Ping:1482694298687246377>︲${roleMention(IDs.roles?.Events)} · ${roleMention(cfg?.finaleCommemorativoRoleId || cfg?.completionRoleId || IDs.roles?.HogwartsEventParticipant)}`,
  ].join("\n");
}

/**
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").Guild} guild
 * @param {object} summary
 * @param {{ force?: boolean }} [options]
 */
async function publishHogwartsFinaleAnnounce(client, guild, summary, options = {}) {
  const cfg = resolveHogwartsEventConfig(client);
  const channelId = normalizeId(cfg.finaleAnnounceChannelId || IDs.channels?.eventAnnouncements);
  if (!guild?.id || !channelId) {
    return { ok: false, reason: "channel_missing" };
  }
  if (summary?.announceMessageId && !options.force) {
    return { ok: false, reason: "already_posted", messageId: summary.announceMessageId };
  }

  const channel =
    guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId).catch(() => null));
  if (!channel?.isTextBased?.()) {
    global.logger?.warn?.("[HOGWARTS FINALE ANNOUNCE] Canale eventi non valido:", channelId);
    return { ok: false, reason: "channel_invalid" };
  }

  const content = buildHogwartsFinaleAnnounceContent(client, cfg, {
    houseRanking: summary?.houseRanking || [],
    memberTop: summary?.memberTop || [],
  });
  const extraRoles = [
    IDs.roles?.VIPplus,
    IDs.roles?.VIP,
    IDs.roles?.Donator,
    IDs.roles?.Events,
    cfg?.finaleWinnerHouseBonusRoleId || IDs.roles?.HogwartsFinaleWinnerBonus,
    cfg?.finaleCommemorativoRoleId || cfg?.completionRoleId || IDs.roles?.HogwartsEventParticipant,
    cfg?.houses?.gryffindor?.roleId,
    cfg?.houses?.ravenclaw?.roleId,
    cfg?.houses?.hufflepuff?.roleId,
    cfg?.houses?.slytherin?.roleId,
  ];
  const extraUsers = (summary?.memberTop || []).map((row) => row.userId);
  const parts = splitDiscordContent(content);
  const sentIds = [];

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    const mentions = collectAllowedMentions(part, { roles: extraRoles, users: extraUsers });
    const sent = await channel
      .send({
        content: part,
        allowedMentions: {
          roles: mentions.roles,
          users: mentions.users,
          parse: [],
        },
      })
      .catch((err) => {
        global.logger?.warn?.("[HOGWARTS FINALE ANNOUNCE] Invio fallito:", err?.message || err);
        return null;
      });
    if (!sent?.id) return { ok: false, reason: "send_failed", partialIds: sentIds };
    sentIds.push(sent.id);
  }

  global.logger?.info?.(
    `[HOGWARTS FINALE ANNOUNCE] Verbale pubblicato in #${channelId} (${sentIds.length} msg, ${sentIds[0]})`,
  );
  return {
    ok: true,
    channelId,
    messageId: sentIds[0] || null,
    messageIds: sentIds,
  };
}

module.exports = {
  buildHogwartsFinaleAnnounceContent,
  publishHogwartsFinaleAnnounce,
};
