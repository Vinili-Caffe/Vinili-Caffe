const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { siteWorkflowUrl } = require("../../../site/http/discordWorkflowUiGate") as typeof import("../../../site/http/discordWorkflowUiGate");

const { E } = require("../../../../../shared/emojis/emojiCatalog") as typeof import("../../../../../shared/emojis/emojiCatalog");
const build_guidapartners = () => {
    const pmCmdChannelId = String(IDs.channels.staffCmds || "").trim();
    return (
      `${E.VC_PartnerManager} **__GUIDA PARTNERS__**\n\n` +
      `> ${E.VC_Attention} In caso di **infrazione** del _regolamento_ verrà **rimosso** il \`punto\` della __partner__. Ogni **__\`Partner Manager\`__** ha _diritto_ a \`1\` mese e \`15\` giorni di **pausa** __ogni__ anno.\n` +
      `${E.VC_DoubleReply} **Non** fare la stessa __partnership__ più di una volta al **giorno**;\n` +
      `${E.VC_DoubleReply} **Non** fare __partnership__ con se stessi più di una volta al **giorno**;\n` +
      `${E.VC_DoubleReply} **Non** mettere più di __\`5\` partnership__ con lo stesso **utente**;\n` +
      `${E.VC_DoubleReply} **Non** mettere partner con link **scaduti**;\n` +
      `${E.VC_DoubleReply} Il **numero minimo** di __partnership__ da __fare__ in una settimana è __\`30\`__;\n` +
      `${E.VC_Reply} È **vietato** fare __partnership__ con qualsiasi tipo di __server__ \`NSFW\` o che violi i \`ToS\` di **Discord**.\n\n` +
      `${E.VC_Exclamation} **Comandi e ticket:**\n` +
      (pmCmdChannelId
        ? `> \`/partnership\` - Utilizzabile in <#${pmCmdChannelId}> o nei **ticket partnership** sul sito\n`
        : "> `/partnership` - Utilizzabile nei **ticket partnership** sul sito\n") +
      "> `+desc`→ nei **ticket Partnership** sul sito\n" +
      `> Shop → sul **profilo staff** → ${siteWorkflowUrl("staff")}\n` +
      `${E.VC_Exclamation} **Info utili:**\n` +
      `> ${E.VC_Cross} **Non ci sono requisiti per le partner**\n` +
      `> ${E.VC_Verified} **Il manager deve aver completato l'inserimento o non si può fare la partner.**\n` +
      `> ${E.VC_PepeExit} **Il manager non deve uscire dal server o la partner verrà cancellata.**\n` +
      `> ${E.VC_Collab} **I ticket partnership si gestiscono sul sito: fatevi inviare la descrizione e usate i comandi direttamente lì.**`
    );
  };

export = {
  guidapartners: build_guidapartners,
};
