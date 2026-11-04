const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { MOD_RULE_DETAIL } = require("../../../Moderation/utils/modRegolamentoConstants") as typeof import("../../../Moderation/utils/modRegolamentoConstants");

const { E } = require("../../../../../shared/emojis/emojiCatalog") as typeof import("../../../../../shared/emojis/emojiCatalog");
function staffSanctionRuleIntro(ruleKey?) {
  const body = MOD_RULE_DETAIL[ruleKey];
  if (!body) return "";
  return `${E.VC_Dot} ${body}\n`;
}

function buildModerationStaffIntroMarkdown() {
  const ch = IDs.channels;
  const botId = String(IDs.bots?.ViniliCaffeBot || "1329118940110127204").trim();
  const sanzioni = String(ch?.sanzioniUtenti || "1442569245878648924").trim();
  return `${E.VC_Alarm} Per **applicare** le __sanzioni__, è necessario __attenersi__ alle **indicazioni** riportate di seguito e **consultare** le procedure disponibili nelle sottosezioni.

${E.VC_1} ${E.VC_Arrow} Bisogna **__sempre__** allegare le **prove** (screen, video, link di messaggi).

${E.VC_2} ${E.VC_Arrow} Il __numero__ della **sanzione** si basa su quante volte l'**utente** è stato **sanzionato __specificatamente__ per quella regola**.

${E.VC_3} ${E.VC_Arrow} Quando **sanzionate**, usate sempre l'**__articolo__** del **regolamento** infranto.

${E.VC_4} ${E.VC_Arrow} Per visualizzare **quante** volte un __utente__ è stato **sanzionato**, usate il comando +modlogs **__\`ID\`__**.

${E.VC_5} ${E.VC_Arrow} Bisogna **__sempre__** sanzionare nel canale <#${sanzioni}> usando i comandi di <@${botId}>

${E.VC_6} ${E.VC_Arrow} Ogni volta che si __oltrepassa__ il numero di **sanzioni ottenibili** si **ricomincia** il __ciclo__ di sanzioni per quella **specifica __regola__**`;
}

const build_regolamento = () => buildModerationStaffIntroMarkdown();

const build_moderazione_staff = () => buildModerationStaffIntroMarkdown();

const build_generalimoderazione = () => `${E.rules} **__Regola \`1.1\`__**
${staffSanctionRuleIntro("1.1")}                ${E.VC_Reply} Sanzione: **Ban**

                ${E.rules} **__Regola \`1.2\`__**
${staffSanctionRuleIntro("1.2")}                ${E.VC_DoubleReply} 1° Sanzione: **Mute __4h__**
                ${E.VC_DoubleReply} 2° Sanzione: **Mute __12h__**
                ${E.VC_Reply} 3° Sanzione: **Mute __24h__**

                ${E.rules} **__Regola \`1.3\`__**
${staffSanctionRuleIntro("1.3")}                ${E.VC_DoubleReply} 1° Sanzione: **Mute __4h__**
                ${E.VC_DoubleReply} 2° Sanzione: **Mute __8h__**
                ${E.VC_Reply} 3° Sanzione: **Mute __18h__**

                ${E.rules} **__Regola \`1.4\`__**
${staffSanctionRuleIntro("1.4")}                ${E.VC_Reply} Sanzione: **Ban**

                ${E.rules} **__Regola \`1.5\`__**
${staffSanctionRuleIntro("1.5")}                ${E.VC_Reply} Sanzione: **Ban**

                ${E.rules} **__Regola \`1.6\`__**
${staffSanctionRuleIntro("1.6")}                ${E.VC_DoubleReply} 1° Sanzione: **Mute __12h__**
                ${E.VC_DoubleReply} 2° Sanzione: **Mute __24h__**
                ${E.VC_DoubleReply} 3° Sanzione: **Mute __48h__**
                ${E.VC_Reply} 4° Sanzione: **Ban**`;

const build_testualimoderazione = () => `${E.rules} **__Regola \`2.1\`__**
${staffSanctionRuleIntro("2.1")}                ${E.VC_DoubleReply} 1° Sanzione: **Mute __24h__**
                ${E.VC_Reply} 2° Sanzione: **Ban**

                ${E.rules} **__Regola \`2.2\`__**
${staffSanctionRuleIntro("2.2")}                ${E.VC_Reply} Sanzione: **Ban**

                ${E.rules} **__Regola \`2.3\`__**
${staffSanctionRuleIntro("2.3")}                ${E.VC_DoubleReply} 1° Sanzione: **Mute __3h__**
                ${E.VC_Reply} 2° Sanzione: **Mute __6h__**

                ${E.rules} **__Regola \`2.4\`__**
${staffSanctionRuleIntro("2.4")}                ${E.VC_DoubleReply} 1° Sanzione: **Warn**
                ${E.VC_Reply} 2° Sanzione: **Mute __2h__**`;

const build_vocalimoderazione = () => `${E.rules} **__Regola \`3.1\`__**
${staffSanctionRuleIntro("3.1")}                ${E.VC_DoubleReply} 1° Sanzione: **Mute __12h__**
                ${E.VC_DoubleReply} 2° Sanzione: **Mute __24h__**
                ${E.VC_Reply} 3° Sanzione: **Ban**

                ${E.rules} **__Regola \`3.2\`__**
${staffSanctionRuleIntro("3.2")}                ${E.VC_DoubleReply} 1° Sanzione: **Mute __4h__**
                ${E.VC_DoubleReply} 2° Sanzione: **Mute __12h__**
                ${E.VC_Reply} 3° Sanzione: **Mute __24h__**

                ${E.rules} **__Regola \`3.3\`__**
${staffSanctionRuleIntro("3.3")}                ${E.VC_DoubleReply} 1° Sanzione: **Mute __2h__**
                ${E.VC_DoubleReply} 2° Sanzione: **Mute __6h__**
                ${E.VC_Reply} 3° Sanzione: **Mute __12h__**

                ${E.rules} **__Regola \`3.4\`__**
${staffSanctionRuleIntro("3.4")}                ${E.VC_DoubleReply} 1° Sanzione: **Mute __6h__**
                ${E.VC_DoubleReply} 2° Sanzione: **Mute __15h__**
                ${E.VC_Reply} 3° Sanzione: **Mute __35h__**

                ${E.rules} **__Regola \`3.5\`__**
${staffSanctionRuleIntro("3.5")}                ${E.VC_DoubleReply} 1° Sanzione: **Mute __5h__**
                ${E.VC_DoubleReply} 2° Sanzione: **Mute __11h__**
                ${E.VC_Reply} 3° Sanzione: **Mute __24h__**`;

export = {
  regolamento: build_regolamento,
  moderazione_staff: build_moderazione_staff,
  generalimoderazione: build_generalimoderazione,
  testualimoderazione: build_testualimoderazione,
  vocalimoderazione: build_vocalimoderazione,
};
