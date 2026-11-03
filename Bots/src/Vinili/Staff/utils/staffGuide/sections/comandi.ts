const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");

const build_comandi = () =>
    `<a:VC_StarPink:1330194976440848500> Visto l'alto flusso di utenti che entrano solo per trollare o flammare, abbiamo una guida dedicata ai comandi di moderazione.\n` +
    `> <:VC_Quest:1482534879257165865> Per i tempi e le regole seguite sempre la sezione **Regolamento** della guida. Inoltre avete tutti un limite di sanzioni settimanali per una valutazione positiva. Non è un obbligo ma aiuta a capire chi è più attivo e a tenere pulito il server.\n\n` +
    "<:VC_BanHammer:1482534474502897795> **LISTA DEI COMANDI**\n\n" +
    "`+purge` <a:VC_Arrow:1482706699365257397> Serve per cancellare i messaggi di un determinato canale o utente, utilizzabile solo dall'<@&" +
    IDs.roles.HighStaff +
    ">\n" +
    "`+warn` <a:VC_Arrow:1482706699365257397> Serve per dare un avviso a un utente, esso è eseguibile da tutti. I warn vengono dati anche a chi apre un ticket sul sito e non risponde nell'arco delle 24 ore oppure trolla all'interno.\n" +
    "`+mute` <a:VC_Arrow:1482706699365257397> Questo comando si può utilizzare solo da <@&" +
    IDs.roles.Mod +
    "> in sù e serve per silenziare un membro che commette un infrazione delle regole. Questo comando oltre a mutare mettere in \"quarantena\" l'utente, ovvero toglie completamente i ruoli all'utente e ne mette uno con cui non può fare nulla.\n" +
    "`+kick` <a:VC_Arrow:1482706699365257397> Serve per buttare fuori, in modo temporaneo, un utente dal server. Utilizzabile solo dall'<@&" +
    IDs.roles.HighStaff +
    ">.\n" +
    "`+ban` <a:VC_Arrow:1482706699365257397> Questo è il comando più estremo, ovvero quello da usare veramente poco ma quando si è passato un certo limite o le regole lo impongono. Naturalmente quello che fa è bannare permanentemente un utente ed è utilizzabile solo dal <@&" +
    IDs.roles.Director +
    "> in sù.\n" +
    "`+modlogs` <a:VC_Arrow:1482706699365257397> Esso serve per controllare quante sanzioni ha un utente e vi è molto utile a capire se un utente ha già infranto una determinata regola e quindi quale tempistica applicare.\n" +
    "`+duration` e `+reason` <a:VC_Arrow:1482706699365257397> Servono rispettivamente per cambiare la durata e la reason di una sanzione, utilizzabile solo dal <@&" +
    IDs.roles.Director +
    "> in sù.\n" +
    "`+case` <a:VC_Arrow:1482706699365257397> Con questo si può controllare dettagliatamente un caso di moderazione e capire quando, da chi e perchè è stato fatto.\n" +
    "`+moderations` <a:VC_Arrow:1482706699365257397> Serve per mostrare le sanzioni **temporanee** attive su un utente.\n" +
    "`+warnings` <a:VC_Arrow:1482706699365257397> Mostra tutti i **warn** ottenuti da un utente.\n" +
    "`+clearwarn`, `+delwarn`, `+unmute` e `+unban` <a:VC_Arrow:1482706699365257397> Usati solo per rimuovere rispettivamente un warn (o tutti i warn col primo), un mute e un ban. Utilizzabili solo da <@&" +
    IDs.roles.Director +
    "> in sù.\n\n" +
    "## <a:VC_Alert:1482706673176150077> Prendi tempo per sanzionare!\n" +
    "È meglio una sanzione legittima con una motivazione corretta e una tempistica giusta rispetto a un utente che si lamenta dello staff del server!";

export = {
  comandi: build_comandi,
};
