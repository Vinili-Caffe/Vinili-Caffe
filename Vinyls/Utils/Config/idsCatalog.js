'use strict';

function parseNameIdText(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.lastIndexOf('->');
      if (idx === -1) return null;
      const name = line.slice(0, idx).trim();
      const id = line.slice(idx + 2).trim();
      if (!name || !/^\d{16,20}$/.test(id)) return null;
      return { name, id };
    })
    .filter(Boolean);
}

function toLastValueMap(entries) {
  const map = {};
  for (const entry of entries) map[entry.name] = entry.id;
  return map;
}

function toMultiValueMap(entries) {
  const map = {};
  for (const entry of entries) {
    if (!map[entry.name]) map[entry.name] = [];
    if (!map[entry.name].includes(entry.id)) map[entry.name].push(entry.id);
  }
  return map;
}
const categoriesRaw = `
⁰¹・ .gg/viniliecaffe ・ -> 1471511929691574466
`;
const channelsRaw = `
moderator-only -> 1471524589589758042
༄📀︲gg∕viniliecaffe -> 1471522798315901019
`;
const rolesRaw = `
༄ Caffè -> 1482685762754445487
༄ Vinili -> 1475812298281980007
༄ Guilded -> 1471628245404483762
. -> 1471987465651880088
༄ Bot Ufficiale -> 1472913683599593644
༄ Server Booster -> 1471512411306459348
༄ Verificato -> 1471522716099154091
`;
const botsRaw = `
Vinili -> 1329118940110127204
Caffè -> 1466495522474037463
`;
const emojisRaw = `
VC_1 -> 1482706338021642333
VC_10 -> 1482706613663174707
VC_11 -> 1519322162329026812
VC_12 -> 1519322163906216046
VC_13 -> 1519322166154362930
VC_14 -> 1519322160945041559
VC_15 -> 1519322169463537785
VC_16 -> 1519322159430762526
VC_17 -> 1519322171519012894
VC_18 -> 1519322153411940465
VC_19 -> 1519322157769949344
VC_2 -> 1482706376525611090
VC_20 -> 1519322155525865482
VC_3 -> 1482706404773990460
VC_4 -> 1482706432347344916
VC_5 -> 1482706459765637272
VC_6 -> 1482706490769801327
VC_7 -> 1482706523330183218
VC_8 -> 1482706553281708092
VC_9 -> 1482706583438889051
VC_aquarius -> 1495124437421392124
VC_ares -> 1495124414168039684
VC_cancer -> 1495124417091735753
VC_capricorn -> 1495124425648111768
VC_666_1 -> 1528177848890691684
VC_666_2 -> 1528177905404870828
VC_Cat1 -> 1528177482807640125
VC_Cat2 -> 1528177684843073546
VC_Femboy1 -> 1528177995095867515
VC_Femboy2 -> 1528178060581671084
VC_gemini -> 1495124428298916001
VC_leo -> 1495124442362282095
VC_libra -> 1495124430177833143
VC_pisces -> 1495124421449355466
VC_sagittarius -> 1495124448250957996
VC_scorpio -> 1495124445688369253
VC_taurus -> 1495124440143499334
VC_topgg -> 1495124467553275934
VC_virgo -> 1495124433105326211
`;

const categories = parseNameIdText(categoriesRaw);
const channels = parseNameIdText(channelsRaw);
const roles = parseNameIdText(rolesRaw);
const bots = parseNameIdText(botsRaw);
const emojis = parseNameIdText(emojisRaw);

module.exports = {
  raw: { categories: categoriesRaw, channels: channelsRaw, roles: rolesRaw, bots: botsRaw, emojis: emojisRaw },
  entries: { categories, channels, roles, bots, emojis },
  maps: { categories: toLastValueMap(categories), channels: toLastValueMap(channels), roles: toLastValueMap(roles), bots: toLastValueMap(bots), emojis: toLastValueMap(emojis) },
  multi: { categories: toMultiValueMap(categories), channels: toMultiValueMap(channels), roles: toMultiValueMap(roles), bots: toMultiValueMap(bots), emojis: toMultiValueMap(emojis) },
  meta: { guildMain: "1329080093599076474", emojis: { loadingAnimatedId: "1448687876018540695", loadingFallbackId: "1462504528774430962" }, links: { vote: "https://www.viniliecaffe.it/vote", invite: "https://discord.gg/viniliecaffe" } }
};