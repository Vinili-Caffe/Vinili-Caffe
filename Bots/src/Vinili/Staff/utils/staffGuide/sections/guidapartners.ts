const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { siteWorkflowUrl } = require("../../../site/http/discordWorkflowUiGate") as typeof import("../../../site/http/discordWorkflowUiGate");

const build_guidapartners = () => {
    const pmCmdChannelId = String(IDs.channels.staffCmds || "").trim();
    return (
      "<:VC_PartnerManager:1494286911286808576> **__GUIDA PARTNERS__**\n\n" +
      "> <:VC_Attention:1482534443632558151> In caso di **infrazione** del _regolamento_ verrà **rimosso** il `punto` della __partner__. Ogni **__`Partner Manager`__** ha _diritto_ a `1` mese e `15` giorni di **pausa** __ogni__ anno.\n" +
      "<:VC_DoubleReply:1482532332509466797> **Non** fare la stessa __partnership__ più di una volta al **giorno**;\n" +
      "<:VC_DoubleReply:1482532332509466797> **Non** fare __partnership__ con se stessi più di una volta al **giorno**;\n" +
      "<:VC_DoubleReply:1482532332509466797> **Non** mettere più di __`5` partnership__ con lo stesso **utente**;\n" +
      "<:VC_DoubleReply:1482532332509466797> **Non** mettere partner con link **scaduti**;\n" +
      "<:VC_DoubleReply:1482532332509466797> Il **numero minimo** di __partnership__ da __fare__ in una settimana è __`30`__;\n" +
      "<:VC_Reply:1482532158080942191> È **vietato** fare __partnership__ con qualsiasi tipo di __server__ `NSFW` o che violi i `ToS` di **Discord**.\n\n" +
      "<a:VC_Exclamation:1482534702077444217> **Comandi e ticket:**\n" +
      (pmCmdChannelId
        ? `> \`/partnership\` - Utilizzabile in <#${pmCmdChannelId}> o nei **ticket partnership** sul sito\n`
        : "> `/partnership` - Utilizzabile nei **ticket partnership** sul sito\n") +
      "> `+desc`→ nei **ticket Partnership** sul sito\n" +
      `> Shop → sul **profilo staff** → ${siteWorkflowUrl("staff")}\n` +
      "<a:VC_Exclamation:1482534702077444217> **Info utili:**\n" +
      "> <a:VC_Cross:1482532424570376253> **Non ci sono requisiti per le partner**\n" +
      "> <a:VC_Verified:1482532479637127188> **Il manager deve aver completato l'inserimento o non si può fare la partner.**\n" +
      "> <a:VC_PepeExit:1446190735937245415> **Il manager non deve uscire dal server o la partner verrà cancellata.**\n" +
      `> <:VC_Collab:1482534540089098260> **I ticket partnership si gestiscono sul sito: fatevi inviare la descrizione e usate i comandi direttamente lì.**`
    );
  };

export = {
  guidapartners: build_guidapartners,
};
