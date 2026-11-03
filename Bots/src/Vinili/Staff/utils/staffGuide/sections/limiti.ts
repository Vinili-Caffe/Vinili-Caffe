const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");

const build_limiti = () =>
    "<:VC_Info:1482526956703580372> I **`limiti settimanali`** sono dei **messaggi** e delle **ore vocali** che entro una __settimana__ si devono __raggiungere__.\n" +
    "> <:VC_Attention:1482534443632558151> **Superare** i limiti di __poco__ potrebbe comportare un **depex**, mentre **superarli** di __tanto__ **__non garantisce__** un **pex**.\n" +
    "<a:VC_Arrow:1482706699365257397> <@&" +
    IDs.roles.Helper +
    ">\n" +
    "<:VC_DoubleReply:1482532332509466797> **__400__** messaggi\n" +
    "<:VC_Reply:1482532158080942191> **__4h__** in vocale\n\n" +
    "<a:VC_Arrow:1482706699365257397> <@&" +
    IDs.roles.Mod +
    ">\n" +
    "<:VC_DoubleReply:1482532332509466797> **__500__** messaggi\n" +
    "<:VC_Reply:1482532158080942191> **__5h__** in vocale\n\n" +
    "<a:VC_Arrow:1482706699365257397> <@&" +
    IDs.roles.SeniorModerator +
    ">\n" +
    "<:VC_DoubleReply:1482532332509466797> **__600__** messaggi\n" +
    "<:VC_Reply:1482532158080942191> **__6h__** in vocale\n\n" +
    "<a:VC_Arrow:1482706699365257397> <@&" +
    IDs.roles.Director +
    ">\n" +
    "<:VC_DoubleReply:1482532332509466797> **__550__** messaggi\n" +
    "<:VC_Reply:1482532158080942191> **__5,5h__** in vocale\n" +
    "> <:VC_Attention:1482534443632558151> Verrà **valutato** anche il **modo** in cui questi __limiti__ vengono raggiunti, ovvero se lo **staffer** è stato costante o no.\n" +
    "> <a:VC_Arrow:1482706699365257397> **__LIMITI SETTIMANALI SULLE SANZIONI__**\n" +
    "<:VC_Dot:1482532364222595303> Ogni <@&" +
    IDs.roles.Helper +
    "> dovrà __eseguire__ almeno: **`1 sanzione`**\n" +
    "<:VC_Dot:1482532364222595303> Ogni <@&" +
    IDs.roles.Mod +
    "> dovrà __eseguire__ almeno: **`2 sanzioni`**\n" +
    "<:VC_Dot:1482532364222595303> Ogni <@&" +
    IDs.roles.SeniorModerator +
    "> dovrà __eseguire__ almeno: **`2 sanzioni`**\n" +
    "<:VC_Dot:1482532364222595303> Ogni <@&" +
    IDs.roles.Director +
    "> dovrà __eseguire__ almeno: **`1 sanzione`**\n" +
    "> Chi __rispetterà__ questi limiti riceverà **una valutazione positiva**.";

export = {
  limiti: build_limiti,
};
