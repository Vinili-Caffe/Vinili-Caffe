const IDs = require("../../../../Config/ids") as typeof import("../../../../Config/ids");

const { E } = require("../../../../../shared/emojis/emojiCatalog") as typeof import("../../../../../shared/emojis/emojiCatalog");
const build_limiti = () =>
    `${E.VC_Info} I **\`limiti settimanali\`** sono dei **messaggi** e delle **ore vocali** che entro una __settimana__ si devono __raggiungere__.\n` +
    `> ${E.VC_Attention} **Superare** i limiti di __poco__ potrebbe comportare un **depex**, mentre **superarli** di __tanto__ **__non garantisce__** un **pex**.\n` +
    `${E.VC_Arrow} <@&` +
    IDs.roles.Helper +
    ">\n" +
    `${E.VC_DoubleReply} **__400__** messaggi\n` +
    `${E.VC_Reply} **__4h__** in vocale\n\n` +
    `${E.VC_Arrow} <@&` +
    IDs.roles.Mod +
    ">\n" +
    `${E.VC_DoubleReply} **__500__** messaggi\n` +
    `${E.VC_Reply} **__5h__** in vocale\n\n` +
    `${E.VC_Arrow} <@&` +
    IDs.roles.SeniorModerator +
    ">\n" +
    `${E.VC_DoubleReply} **__600__** messaggi\n` +
    `${E.VC_Reply} **__6h__** in vocale\n\n` +
    `${E.VC_Arrow} <@&` +
    IDs.roles.Director +
    ">\n" +
    `${E.VC_DoubleReply} **__550__** messaggi\n` +
    `${E.VC_Reply} **__5,5h__** in vocale\n` +
    `> ${E.VC_Attention} Verrà **valutato** anche il **modo** in cui questi __limiti__ vengono raggiunti, ovvero se lo **staffer** è stato costante o no.\n` +
    `> ${E.VC_Arrow} **__LIMITI SETTIMANALI SULLE SANZIONI__**\n` +
    `${E.VC_Dot} Ogni <@&` +
    IDs.roles.Helper +
    "> dovrà __eseguire__ almeno: **`1 sanzione`**\n" +
    `${E.VC_Dot} Ogni <@&` +
    IDs.roles.Mod +
    "> dovrà __eseguire__ almeno: **`2 sanzioni`**\n" +
    `${E.VC_Dot} Ogni <@&` +
    IDs.roles.SeniorModerator +
    "> dovrà __eseguire__ almeno: **`2 sanzioni`**\n" +
    `${E.VC_Dot} Ogni <@&` +
    IDs.roles.Director +
    "> dovrà __eseguire__ almeno: **`1 sanzione`**\n" +
    "> Chi __rispetterà__ questi limiti riceverà **una valutazione positiva**.";

export = {
  limiti: build_limiti,
};
