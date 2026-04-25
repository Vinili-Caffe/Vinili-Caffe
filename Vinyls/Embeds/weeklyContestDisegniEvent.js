const { EmbedBuilder } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const { getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache");
const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");
const { personalityPanelFindOneAndUpdate, personalityPanelUpdateOne } = require("../Utils/Global/globalSettingsGuildStores");
const { DIVIDER_URL } = require("../../shared/discord/constants");

const CHANNEL_ID = IDs.channels.eventAnnouncements;

async function run(client) {
  if (String(process.env.WEEKLY_CONTEST_DISEGNI_EMBED_ENABLE || "").trim() !== "1") return;
  const channel = await getClientChannelCached(client, CHANNEL_ID);
  if (!channel?.isTextBased?.()) return;
  const guildId = channel.guild?.id;
  if (!guildId) return;

  let panel = null;
  try {
    panel = await personalityPanelFindOneAndUpdate(
      { guildId, channelId: CHANNEL_ID },
      { $setOnInsert: { guildId, channelId: CHANNEL_ID } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    global.logger?.warn?.("[embeds] weeklyContestDisegniEvent panel:", err?.message || err);
  }

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Weekly Event #3 · Contest Outfit")
    .setDescription(
      [
        "# <a:VC_Calendar:1482706208149475358> [WEEKLY EVENT #3](<https://discord.gg/viniliecaffe?event=1497363661470175495>)",
        "",
        "<a:VC_Winner:1482535294757507255> L'evento di questa settimana è... **CONTEST OUTFIT!**",
        "",
        "<:VC_PinkQuestionMark:1471892611026391306> **MA COME FUNZIONA?**",
        "<:VC_DoubleReply:1482532332509466797> Ognuno potrà inviare a piacere massimo **1 foto di SE STESSI con un outfit** (non è obbligatorio mettere la propria faccia) in <#1497360902213861487>;",
        "<:VC_DoubleReply:1482532332509466797> Lo <@&1442568910070349985> potrà votare per **massimo 2 outfit** per categoria;",
        "<:VC_DoubleReply:1482532332509466797> I <@&1329497467481493607>, <@&1442568950805430312> e <@&1442568916114346096> potranno votare per **massimo 2 outfit**;",
        "<:VC_Reply:1482532158080942191> Ogni giorno verrà creata una **top 3 membri più attivi** ed essi otterranno un voto in più al giorno da poter assegnare (sullo stesso o su un altro).",
        "> **Il nostro consiglio è di invitare i vostri amici e farvi votare <a:VC_HeartsBlue:1468686100045369404> **",
        "",
        "<a:VC_Rule:1482706839928967280> **REGOLAMENTO**",
        "<:VC_Dot:1482532364222595303> Lo <@&1442568910070349985> non può partecipare, tuttavia potrà ugualmente esprimere preferenze;",
        "<:VC_Dot:1482532364222595303> Vietato rubare outfit online da altre persone poichè essi saranno controllati ogni giorno;",
        "<:VC_Dot:1482532364222595303> Non è possibile votare per se stessi;",
        "<:VC_Dot:1482532364222595303> Nessuno sarà a conoscenza il numero dei voti dei vari outfit fino al termine dell'evento;",
        "<:VC_Dot:1482532364222595303> Non si possono utilizzare alt per le votazioni;",
        "<:VC_Dot:1482532364222595303> Le preferenze saranno validate solo se all'interno del server fino alla fine dell'evento;",
        "<:VC_Dot:1482532364222595303> È vietato spammare in DM per farsi votare.",
        "",
        "<:VC_BanHammer:1482534474502897795> In caso di mancato rispetto di una delle regole, la pena è la **squalifica immediata**.",
        "",
        "<:VC_Leaderboard:1482534806314287387> **RICOMPENSE**",
        "<:VC_Podio1:1482694399283433582> Il primo posto vincerà un **Nitro Boost**",
        "<:VC_Podio2:1482694424411635712> Il secondo posto vincerà una **decorazione a propria scelta** **__(NO BUNDLE)__**;",
        "<:VC_Podio3:1482694450806259744> Il terzo posto vincerà **il ruolo <@&1442568950805430312> per 30 giorni**.",
        "",
        "<a:VC_Calendar:1482706208149475358> L'evento avrà inizio il **<t:1777284000:f>** e finirà il **<t:1777834800:f>**.",
        "",
        "<a:VC_Ping:1482694298687246377>︲<@&1442569012063109151>",
      ].join("\n"),
    )
    .setImage(DIVIDER_URL);

  const msg = await upsertPanelMessage(channel, client, {
    messageId: panel?.weeklyContestDisegniEventMessageId || null,
    embeds: [embed],
  });

  if (msg?.id) {
    try {
      await personalityPanelUpdateOne(
        { guildId, channelId: CHANNEL_ID },
        { $set: { weeklyContestDisegniEventMessageId: msg.id } },
      );
    } catch (err) {
      global.logger?.warn?.("[embeds] weeklyContestDisegniEvent update:", err?.message || err);
    }
  }
}

module.exports = { name: "weeklyContestDisegniEvent", order: 36, section: "embedOnly", run };