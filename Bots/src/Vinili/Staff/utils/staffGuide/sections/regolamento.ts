const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { MOD_RULE_DETAIL } = require("../../../Moderation/utils/modRegolamentoConstants") as typeof import("../../../Moderation/utils/modRegolamentoConstants");

function staffSanctionRuleIntro(ruleKey?) {
  const body = MOD_RULE_DETAIL[ruleKey];
  if (!body) return "";
  return `<:VC_Dot:1482532364222595303> ${body}\n`;
}

function buildModerationStaffIntroMarkdown() {
  const ch = IDs.channels;
  const botId = String(IDs.bots?.ViniliCaffeBot || "1329118940110127204").trim();
  const sanzioni = String(ch?.sanzioniUtenti || "1442569245878648924").trim();
  return `<a:VC_Alarm:1482706641618079816> Per **applicare** le __sanzioni__, è necessario __attenersi__ alle **indicazioni** riportate di seguito e **consultare** le procedure disponibili nelle sottosezioni.

<:VC_1:1482706338021642333> <a:VC_Arrow:1482706699365257397> Bisogna **__sempre__** allegare le **prove** (screen, video, link di messaggi).

<:VC_2:1482706376525611090> <a:VC_Arrow:1482706699365257397> Il __numero__ della **sanzione** si basa su quante volte l'**utente** è stato **sanzionato __specificatamente__ per quella regola**.

<:VC_3:1482706404773990460> <a:VC_Arrow:1482706699365257397> Quando **sanzionate**, usate sempre l'**__articolo__** del **regolamento** infranto.

<:VC_4:1482706432347344916> <a:VC_Arrow:1482706699365257397> Per visualizzare **quante** volte un __utente__ è stato **sanzionato**, usate il comando +modlogs **__\`ID\`__**.

<:VC_5:1482706459765637272> <a:VC_Arrow:1482706699365257397> Bisogna **__sempre__** sanzionare nel canale <#${sanzioni}> usando i comandi di <@${botId}>

<:VC_6:1482706490769801327> <a:VC_Arrow:1482706699365257397> Ogni volta che si __oltrepassa__ il numero di **sanzioni ottenibili** si **ricomincia** il __ciclo__ di sanzioni per quella **specifica __regola__**`;
}

const build_regolamento = () => buildModerationStaffIntroMarkdown();

const build_moderazione_staff = () => buildModerationStaffIntroMarkdown();

const build_generalimoderazione = () => `<:rules:1443307208543703131> **__Regola \`1.1\`__**
${staffSanctionRuleIntro("1.1")}                <:VC_Reply:1482532158080942191> Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`1.2\`__**
${staffSanctionRuleIntro("1.2")}                <:VC_DoubleReply:1482532332509466797> 1° Sanzione: **Mute __4h__**
                <:VC_DoubleReply:1482532332509466797> 2° Sanzione: **Mute __12h__**
                <:VC_Reply:1482532158080942191> 3° Sanzione: **Mute __24h__**

                <:rules:1443307208543703131> **__Regola \`1.3\`__**
${staffSanctionRuleIntro("1.3")}                <:VC_DoubleReply:1482532332509466797> 1° Sanzione: **Mute __4h__**
                <:VC_DoubleReply:1482532332509466797> 2° Sanzione: **Mute __8h__**
                <:VC_Reply:1482532158080942191> 3° Sanzione: **Mute __18h__**

                <:rules:1443307208543703131> **__Regola \`1.4\`__**
${staffSanctionRuleIntro("1.4")}                <:VC_Reply:1482532158080942191> Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`1.5\`__**
${staffSanctionRuleIntro("1.5")}                <:VC_Reply:1482532158080942191> Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`1.6\`__**
${staffSanctionRuleIntro("1.6")}                <:VC_DoubleReply:1482532332509466797> 1° Sanzione: **Mute __12h__**
                <:VC_DoubleReply:1482532332509466797> 2° Sanzione: **Mute __24h__**
                <:VC_DoubleReply:1482532332509466797> 3° Sanzione: **Mute __48h__**
                <:VC_Reply:1482532158080942191> 4° Sanzione: **Ban**`;

const build_testualimoderazione = () => `<:rules:1443307208543703131> **__Regola \`2.1\`__**
${staffSanctionRuleIntro("2.1")}                <:VC_DoubleReply:1482532332509466797> 1° Sanzione: **Mute __24h__**
                <:VC_Reply:1482532158080942191> 2° Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`2.2\`__**
${staffSanctionRuleIntro("2.2")}                <:VC_Reply:1482532158080942191> Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`2.3\`__**
${staffSanctionRuleIntro("2.3")}                <:VC_DoubleReply:1482532332509466797> 1° Sanzione: **Mute __3h__**
                <:VC_Reply:1482532158080942191> 2° Sanzione: **Mute __6h__**

                <:rules:1443307208543703131> **__Regola \`2.4\`__**
${staffSanctionRuleIntro("2.4")}                <:VC_DoubleReply:1482532332509466797> 1° Sanzione: **Warn**
                <:VC_Reply:1482532158080942191> 2° Sanzione: **Mute __2h__**`;

const build_vocalimoderazione = () => `<:rules:1443307208543703131> **__Regola \`3.1\`__**
${staffSanctionRuleIntro("3.1")}                <:VC_DoubleReply:1482532332509466797> 1° Sanzione: **Mute __12h__**
                <:VC_DoubleReply:1482532332509466797> 2° Sanzione: **Mute __24h__**
                <:VC_Reply:1482532158080942191> 3° Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`3.2\`__**
${staffSanctionRuleIntro("3.2")}                <:VC_DoubleReply:1482532332509466797> 1° Sanzione: **Mute __4h__**
                <:VC_DoubleReply:1482532332509466797> 2° Sanzione: **Mute __12h__**
                <:VC_Reply:1482532158080942191> 3° Sanzione: **Mute __24h__**

                <:rules:1443307208543703131> **__Regola \`3.3\`__**
${staffSanctionRuleIntro("3.3")}                <:VC_DoubleReply:1482532332509466797> 1° Sanzione: **Mute __2h__**
                <:VC_DoubleReply:1482532332509466797> 2° Sanzione: **Mute __6h__**
                <:VC_Reply:1482532158080942191> 3° Sanzione: **Mute __12h__**

                <:rules:1443307208543703131> **__Regola \`3.4\`__**
${staffSanctionRuleIntro("3.4")}                <:VC_DoubleReply:1482532332509466797> 1° Sanzione: **Mute __6h__**
                <:VC_DoubleReply:1482532332509466797> 2° Sanzione: **Mute __15h__**
                <:VC_Reply:1482532158080942191> 3° Sanzione: **Mute __35h__**

                <:rules:1443307208543703131> **__Regola \`3.5\`__**
${staffSanctionRuleIntro("3.5")}                <:VC_DoubleReply:1482532332509466797> 1° Sanzione: **Mute __5h__**
                <:VC_DoubleReply:1482532332509466797> 2° Sanzione: **Mute __11h__**
                <:VC_Reply:1482532158080942191> 3° Sanzione: **Mute __24h__**`;

export = {
  regolamento: build_regolamento,
  moderazione_staff: build_moderazione_staff,
  generalimoderazione: build_generalimoderazione,
  testualimoderazione: build_testualimoderazione,
  vocalimoderazione: build_vocalimoderazione,
};
