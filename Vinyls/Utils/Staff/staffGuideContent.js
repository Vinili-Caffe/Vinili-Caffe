const IDs = require("../Config/ids");
const { MOD_RULE_DETAIL } = require("../Moderation/modRegolamentoConstants");
const { siteWorkflowUrl } = require("../Web/discordWorkflowUiGate");

function staffSanctionRuleIntro(ruleKey) {
  const body = MOD_RULE_DETAIL[ruleKey];
  if (!body) return "";
  return `<:VC_Dot:1482532364222595303> ${body}\n`;
}

/** Same labels as staffGuideMenuComponents.STAFF_GUIDE_SECTIONS */
const TOP_LEVEL_SECTION_META = [
  { id: "regolamento", label: "Regolamento", description: "Regole e sanzioni utenti", emoji: "<:rules:1443307208543703131>" },
  { id: "regole_staff", label: "Regole staff", description: "Regole di comportamento dello staff", emoji: "<:discordstaff:1443651872258003005>" },
  { id: "limiti", label: "Limiti settimanali", description: "Obiettivi di attività settimanale", emoji: "<:reportmessage:1443670575376765130>" },
  { id: "compiti_fissi", label: "Compiti fissi", description: "Compiti fissi da svolgere ogni settimana", emoji: "<:VC_Quest:1482534879257165865>" },
  { id: "pause", label: "Pause", description: "Come funzionano le pause staff", emoji: "<:Clock:1330530065133338685>" },
  { id: "lineeguida", label: "Linee guida", description: "Comportamento e buone pratiche", emoji: "<:VC_PinkQuestionMark:1471892611026391306>" },
  { id: "comandi", label: "Comandi", description: "Comandi utili per lo staff", emoji: "<:VC_Bot:1482526555174604964>" },
  { id: "valutazioni", label: "Valutazioni", description: "Positive, negative e automatiche", emoji: "<a:loading:1443934440614264924>" },
  { id: "pex", label: "Guida Pex", description: "Promozioni e requisiti", emoji: "<a:VC_LevelUp:1482527020641419415>" },
  { id: "warnstaff", label: "Warn staff", description: "Come funzionano i warn staff", emoji: "<:banhammer:1443651875441217639>" },
  { id: "guidapartners", label: "Guida Partners", description: "Guida Partner Manager", emoji: "<:VC_PartnerManager:1494286911286808576>" },
  { id: "guidamiddle", label: "Guida Middle", description: "Guida Senior Mod & Director", emoji: "<:VC_Staff:1494286904089247754>" },
];

const NESTED_SECTION_META = [
  {
    id: "generalimoderazione",
    label: "Generali",
    description: "Sanzioni regole generali",
    parent: "regolamento",
    emoji: "<:appdirectoryallwhite:1443308556995788840>",
  },
  {
    id: "testualimoderazione",
    label: "Testuali",
    description: "Sanzioni regole testuali",
    parent: "regolamento",
    emoji: "<:discordchannelwhite:1443308552536985810>",
  },
  {
    id: "vocalimoderazione",
    label: "Vocali",
    description: "Sanzioni regole vocali",
    parent: "regolamento",
    emoji: "<:microphone:1443307206824169573>",
  },
  {
    id: "middle_ticket",
    label: "Gestione Ticket",
    description: "Ticket sul sito (staff)",
    parent: "guidamiddle",
    emoji: "<:VC_Ticket:1482535175283019888>",
  },
  {
    id: "middle_selfie",
    label: "Verifica Selfie",
    description: "Verifica selfie e ruoli",
    parent: "guidamiddle",
    emoji: "<a:VC_Verified:1482532479637127188>",
  },
  {
    id: "middle_follower",
    label: "Follower & Supporter",
    description: "Liste follower e supporter",
    parent: "guidamiddle",
    emoji: "<a:VC_Verified:1482532479637127188>",
  },
  {
    id: "middle_partnership",
    label: "Gestione Partner",
    description: "Controllo partnership settimanale",
    parent: "guidamiddle",
    emoji: "<:VC_Collab:1482534540089098260>",
  },
];

const SECTION_CHILDREN = {
  // Stesso contenuto sticky del canale #sanzioni-utenti
  regolamento: ["generalimoderazione", "testualimoderazione", "vocalimoderazione"],
  // Alias legacy (menu Discord / bottoni vecchi)
  moderazione_staff: ["generalimoderazione", "testualimoderazione", "vocalimoderazione"],
  guidamiddle: ["middle_ticket", "middle_selfie", "middle_follower", "middle_partnership"],
};

function listStaffGuideSectionMeta() {
  const top = TOP_LEVEL_SECTION_META.map((section) => ({
    id: section.id,
    label: section.label,
    description: section.description,
    emoji: section.emoji,
  }));
  const nested = NESTED_SECTION_META.map((section) => ({
    id: section.id,
    label: section.label,
    description: section.description,
    parent: section.parent,
    emoji: section.emoji,
  }));
  return [...top, ...nested];
}

function getStaffGuideSectionMeta(sectionId) {
  const id = String(sectionId || "").trim();
  return listStaffGuideSectionMeta().find((s) => s.id === id) || null;
}

function getStaffGuideChildSectionIds(sectionId) {
  return SECTION_CHILDREN[String(sectionId || "").trim()] || [];
}

function buildStaffGuideIntroMarkdown() {
  const ch = IDs.channels;
  return [
    "<:discordstaff:1443651872258003005> La **guida staff** è il manuale ufficiale di **Vinili & Caffè**: qui trovi regole, obiettivi di attività, procedure di moderazione e criteri di carriera.",
    "",
    "<a:VC_Alert:1482706673176150077> Ogni membro dello staff deve **conoscerla e rispettarla**. In caso di violazioni si possono ricevere **valutazioni negative**, **warn staff** e, nei casi più gravi, il **depex**.",
    "",
    "> <a:VC_Rule:1482706839928967280> Apri una sezione dal menu per leggere il capitolo completo.",
    "",
    "<:VC_Attention:1482534443632558151> **Canali e sito di riferimento**",
    `<:VC_Dot:1482532364222595303> Guida staff completa: ${siteWorkflowUrl("guida")}`,
    `<:VC_Dot:1482532364222595303> Sanzioni utenti: <#${ch.sanzioniUtenti}>`,
    `<:VC_Dot:1482532364222595303> Ticket (supporto, perks, high, partnership): ${siteWorkflowUrl("ticketsStaff")}`,
    `<:VC_Dot:1482532364222595303> Pause / profilo / organico / valutazioni: sul **sito staff**`,
  ].join("\n");
}

/** Intro sticky del canale #sanzioni-utenti (stesso testo di moderazione_staff). */
function buildModerationStaffIntroMarkdown() {
  return `<a:VC_Alarm:1482706641618079816> Per **applicare** le __sanzioni__, è necessario __attenersi__ alle **indicazioni** riportate di seguito e **consultare** le procedure disponibili nelle sottosezioni.

<:VC_1:1482706338021642333> <a:VC_Arrow:1482706699365257397> Bisogna **__sempre__** allegare le **prove** (screen, video, link di messaggi).

<:VC_2:1482706376525611090> <a:VC_Arrow:1482706699365257397> Il __numero__ della **sanzione** si basa su quante volte l'**utente** è stato **sanzionato __specificatamente__ per quella regola**.

<:VC_3:1482706404773990460> <a:VC_Arrow:1482706699365257397> Quando **sanzionate**, usate sempre l'**__articolo__** del **regolamento** infranto.

<:VC_4:1482706432347344916> <a:VC_Arrow:1482706699365257397> Per visualizzare **quante** volte un __utente__ è stato **sanzionato**, usate il comando +modlogs **__\`ID\`__**.

<:VC_5:1482706459765637272> <a:VC_Arrow:1482706699365257397> Bisogna **__sempre__** sanzionare nel canale <#1442569245878648924> usando i comandi di <@1329118940110127204>

<:VC_6:1482706490769801327> <a:VC_Arrow:1482706699365257397> Ogni volta che si __oltrepassa__ il numero di **sanzioni ottenibili** si **ricomincia** il __ciclo__ di sanzioni per quella **specifica __regola__**.`;
}

const SECTION_BUILDERS = {
  // Intro sticky #sanzioni-utenti + sottosezioni Generali/Testuali/Vocali
  regolamento: () => buildModerationStaffIntroMarkdown(),

  regole_staff: () =>
    "<:rules:1443307208543703131> **__REGOLAMENTO STAFF__**\n\n" +
    `<:VC_1:1482706338021642333> **Rispettare** le regole del server.\n` +
    `<:VC_2:1482706376525611090> __Non__ **chiedere** pex _continuamente_.\n` +
    `<:VC_3:1482706404773990460> __Non__ **istigare** o creare **flame** tra lo **\`staff\`** e gli **\`utenti\`**.\n` +
    `<:VC_4:1482706432347344916> __Non__ **abusare** di potere, ad esempio **sanzionando** un __utente__ \`senza un vero motivo\`.\n` +
    `<:VC_5:1482706459765637272> Se si è in una **vocale pubblica** da __mutati__ siete **obbligati** a scrivere in <#1442569130573303898>.\n` +
    `<:VC_6:1482706490769801327> __Non__ **floodare**, **spammare** e **usare bot** per completare i **\`limiti settimanali testuali\`**.\n` +
    `<:VC_7:1482706523330183218> __Non__ passare la maggior parte del **tempo** nei **canali vocali privati**, poiché non vengono **conteggiati** al fine dei __limiti settimanali__.\n` +
    `<:VC_8:1482706553281708092> __Non__ **stare da soli** in una __vocale pubblica__ se in un'altra vi è già un altro **staffer** da solo. Inoltre, almeno uno dei due **deve** essere __smutato__.\n` +
    `> <a:VC_Alert:1482706673176150077> La violazione di una di queste regole può comportare una **sanzione** da parte dello staff, quindi è importante __conoscerle__ e __rispettarle__.`,

  limiti: () =>
    "<:VC_Info:1482526956703580372> I **`limiti settimanali`** sono dei **messaggi** e delle **ore vocali** che entro una __settimana__ si devono __raggiungere__.\n\n" +
    "> <:VC_Attention:1482534443632558151> **Superare** i limiti di __poco__ potrebbe comportare un **depex**, mentre **superarli** di __tanto__ **__non garantisce__** un **pex**.\n\n" +
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
    "<:VC_Reply:1482532158080942191> **__5,5h__** in vocale\n\n" +
    "> <:VC_Attention:1482534443632558151> Verrà **valutato** anche il **modo** in cui questi __limiti__ vengono raggiunti, ovvero se lo **staffer** è stato costante o no.\n" +
    `> <:reportmessage:1443670575376765130> Ogni staffer per sanzionare dovrà __seguire__ la guida (sezione **Regolamento**) sul sito: ${siteWorkflowUrl("guida")}\n\n` +
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
    "> dovrà __eseguire__ almeno: **`1 sanzione`**\n\n" +
    "> Chi __rispetterà__ questi limiti riceverà **una valutazione positiva**.",

  moderazione_staff: () => buildModerationStaffIntroMarkdown(),

  compiti_fissi: () =>
    "<:VC_Quest:1482534879257165865> **__COMPITI FISSI__**\n\n" +
    "<a:VC_NewsExclamation:1471891662786527253> Ogni staffer deve **svolgere** ogni settimana **ALMENO UNO** dei seguenti **compiti**:\n" +
    "<:VC_Dot:1482532364222595303> **Trovare un nuovo staffer**\n" +
    "<:VC_Dot:1482532364222595303> **Trovare un server che dovrà effettuare una sponsor con il nostro server**\n" +
    "<:VC_Dot:1482532364222595303> **Trovare un server disponibili a effettuare un trasferimento nel nostro server**\n" +
    "<:VC_Dot:1482532364222595303> **Invitare nuovi utenti tenedoli attivi**\n" +
    "<:VC_Dot:1482532364222595303> **Convincere nuovi utenti a boostare il server o acquistare un pacchetto come Donator, VIP o VIP+**\n\n" +
    "<:VC_bluthumbsup:1482458262401061044> Svolgere uno tra questi compiti ogni settimana garantirà una **valutazione positiva** e maggiore possibilità di essere pexato.\n" +
    "<:VC_bluthumbsdown:1482458289131360306> Non farlo garantirà una **valutazione negativa** e maggiore possibilità di essere depexato.\n\n" +
    `<:VC_Ticket:1482535175283019888> Per garantire la correttezza dei compiti è necessario allegare le prove aprendo un ticket **High Staff** sul sito: ${siteWorkflowUrl("tickets")}`,

  pause: () =>
    "<:Clock:1330530065133338685> Vinili & Caffè presenta un **sistema** di **`pause`** _sofisticato_, infatti è tutto __organizzato__ per **garantire** al meglio l'__attività__ del server.\n" +
    `> Per __richiedere__ una pausa apri la pagina sul **sito**: ${siteWorkflowUrl("pause")}\n\n` +
    "<a:VC_Arrow:1482706699365257397> **__LIMITI__**\n" +
    "<a:loading:1443934440614264924> In un anno si possono chiedere __massimo__ **`60 giorni`** di pausa che si possono usufruire in __tutti__ i **12 mesi** dell'anno.\n\n" +
    "> Nei giorni **festivi** avrete anche dei giorni in più **ulteriori** al __normale mese__:\n" +
    "<:VC_Dot:1482532364222595303> **24**, **25**, **26**, **31** __Dicembre__\n" +
    "<:VC_Dot:1482532364222595303> **1** Gennaio\n" +
    "<:VC_Dot:1482532364222595303> **Pasqua** e **Pasquetta**\n" +
    "<:VC_Dot:1482532364222595303> **25** __Aprile__\n" +
    "<:VC_Dot:1482532364222595303> **1** __Maggio__\n" +
    "<:VC_Dot:1482532364222595303> **2** __Giugno__\n" +
    "<:VC_Dot:1482532364222595303> **15** __Agosto__\n\n" +
    "> Naturalmente per **garantire** al meglio l'attività del server ci sono dei __limiti__ di staffer che possono essere in pausa nello __stesso periodo__\n" +
    "<:VC_Dot:1482532364222595303> <@&1442568904311570555> <a:VC_Arrow:1482706699365257397> __2__ **staffer**\n" +
    "<:VC_Dot:1482532364222595303> <@&" +
    IDs.roles.Mod +
    "> <a:VC_Arrow:1482706699365257397> __2__ **staffer**\n" +
    "<:VC_Dot:1482532364222595303> <@&" +
    IDs.roles.SeniorModerator +
    "> <a:VC_Arrow:1482706699365257397> __2__ **staffer**\n" +
    "<:VC_Dot:1482532364222595303> <@&" +
    IDs.roles.Director +
    "> <a:VC_Arrow:1482706699365257397> __1__ **staffer**\n" +
    "<:VC_Dot:1482532364222595303> <@&" +
    IDs.roles.Admin +
    "> <a:VC_Arrow:1482706699365257397> __1__ **staffer**\n" +
    "<:VC_Dot:1482532364222595303> <@&" +
    IDs.roles.Manager +
    "> <a:VC_Arrow:1482706699365257397> __1__ **staffer**\n\n" +
    "<:VC_Attention:1482534443632558151> Potrai chiedere __una pausa__ **ogni mese**. Se quest'ultima cade in `2` **__mesi diversi__**, verrà contato il mese in cui viene **chiesta** la __pausa__, a patto che non superi i primi __`5` giorni__ dell'altro mese. Per chiedere un'altra pausa dovrai aspettare almeno **__`1 settimana`__**\n\n" +
    "> <:banhammer:1443651875441217639> Se l'<@&1442568894349840435> verrà a conoscenza di uno **staffer** __in pausa__ ma **attivo** in un **altro server** nel periodo di tempo della pausa, **toglierà** la pausa e **sanzionerà** lo staffer.",

  lineeguida: () =>
    "Per avere un server attivo bisogna prima di tutto avere un legame con la community. Ecco alcuni consigli per instaurare dei discorsi con i nuovi utenti ma anche con quelli anziani.\n\n" +
    "> ### Presentarsi è sempre una buona base!\n" +
    "Nel momento in cui un utente approda nel server, è buona prassi far capire cosa può fare qui con noi. Quando si unisce sa già che come topic abbiamo il chatting quindi si deve puntare a quella che si chiama **profilazione** ovvero la raccolta di dati dell'utente. Per farlo, abbiamo realizzato diversi ruoli che l'utente può prendere. Tutto questo è già possibile con l'inserimento ma, nel caso volesse cambiarli o aggiungerli (cosa su cui dovreste spingere), invece di usare il semplice \"wlc\" potete tranquillamente dire:\n" +
    `benvenutx @tag_utente! passa in <#${IDs.channels.commands}> e fai il comando +profile per prenderti i colori e tanti altri ruoli <3\n\n` +
    "> ### Cerca di capire chi hai davanti!\n" +
    "Per avere attività alla base, come abbiamo detto, c'è un rapporto di fiducia con l'utente. Per creare e rafforzare quest'ultimo, nel momento in cui una persona joina nel server può essere utile:\n" +
    "- guardare la foto profilo e il banner;\n" +
    "- guardare la descrizione e lo status;\n" +
    "- controllare i ruoli presi con l'inserimento.\n" +
    "Questo può servire per trovare degli interessi dell'utente poiché può avere immagini di un determinato film o una descrizione o attività dove è indicato un gioco o un brano in riproduzione utile per ingaggiare il dialogo. Non abbiate paura di dire cosa pensate ma fatelo con leggerezza e divertimento. Se, per esempio, sta ascoltando un brano che non vi piace e questo è l'unico dato che avete in vostro possesso, invece di non fare niente si può dire \"oddio ma ascolti X, a me non piace\" oppure ancora \"oddio X, meglio Y\".\n\n" +
    "> ### La costanza è fondamentale!\n" +
    "Un semplice dialogo che dura poco, non porta a niente. Cercate, anche nei giorni seguenti, di ricordarvi di quell'utente e di cosa avete trattato. Se avete parlato di musica potete condividere il giorno dopo lo screen della vostra riproduzione e taggarlo dicendo \"meglio questa!!\" oppure un semplice \"conosci?\" o nel caso di un gioco potere dire \"come va su gta?\" o robe del genere.\n\n" +
    "> ### Sii preparato a qualsiasi domanda.\n" +
    `Spesso e sicuramente un nuovo utente, specialmente di discord, non sa che ci sono determinati requisiti per fare determinate azioni. Un esempio può essere il <@&${IDs.roles.PicPerms}>. L'utente medio non lo sa e invia sempre a sua insaputa un media. Quest'ultimo, nel caso non si trovasse in possesso del ruolo, il bot <@${IDs.bots.ViniliCaffeBot}> elimina subito il messaggio e scrive che serve questo requisito MA ribaditelo anche voi. In questa maniera il dialogo continua ad esserci e non si interromperà davanti a un messaggio di un bot programmato per farlo!\n\n` +
    "Per portare avanti un progetto, renderlo bello e arricchirlo personalmente sono necessari davvero pochi e piccoli passi. Seguiteli e vedrete che andrà tutto bene! **E ricordati di divertirti!**",

  comandi: () =>
    `<a:VC_StarPink:1330194976440848500> Visto l'alto flusso di utenti che entrano solo per trollare o flammare, abbiamo una guida dedicata ai comandi di moderazione (oltre al **Regolamento** nella guida staff sul sito: ${siteWorkflowUrl("guida")}).\n` +
    `> <:VC_Quest:1482534879257165865> Per i tempi e le regole seguite sempre la sezione **Regolamento** della guida. Inoltre avete tutti un limite di sanzioni settimanali per una valutazione positiva (Helper: **1**, Mod/Senior: **2**, Director: **1**). Non è un obbligo ma aiuta a capire chi è più attivo e a tenere pulito il server.\n\n` +
    "<:VC_BanHammer:1482534474502897795> **LISTA DEI COMANDI**\n\n" +
    "`+purge` <a:VC_Arrow:1482706699365257397> Serve per cancellare i messaggi di un determinato canale o utente, utilizzabile solo dall'<@&" +
    IDs.roles.HighStaff +
    ">\n\n" +
    "`+warn` <a:VC_Arrow:1482706699365257397> Serve per dare un avviso a un utente, esso è eseguibile da tutti. I warn vengono dati anche a chi apre un ticket sul sito e non risponde nell'arco delle 24 ore oppure trolla all'interno.\n\n" +
    "`+mute` <a:VC_Arrow:1482706699365257397> Questo comando si può utilizzare solo da <@&" +
    IDs.roles.Mod +
    "> in sù e serve per silenziare un membro che commette un infrazione delle regole. Questo comando oltre a mutare mettere in \"quarantena\" l'utente, ovvero toglie completamente i ruoli all'utente e ne mette uno con cui non può fare nulla.\n\n" +
    "`+kick` <a:VC_Arrow:1482706699365257397> Serve per buttare fuori, in modo temporaneo, un utente dal server. Utilizzabile solo dall'<@&" +
    IDs.roles.HighStaff +
    ">.\n\n" +
    "`+ban` <a:VC_Arrow:1482706699365257397> Questo è il comando più estremo, ovvero quello da usare veramente poco ma quando si è passato un certo limite o le regole lo impongono. Naturalmente quello che fa è bannare permanentemente un utente ed è utilizzabile solo dal <@&" +
    IDs.roles.Director +
    "> in sù.\n\n" +
    "`+modlogs` <a:VC_Arrow:1482706699365257397> Esso serve per controllare quante sanzioni ha un utente e vi è molto utile a capire se un utente ha già infranto una determinata regola e quindi quale tempistica applicare.\n\n" +
    "`+duration` e `+reason` <a:VC_Arrow:1482706699365257397> Servono rispettivamente per cambiare la durata e la reason di una sanzione, utilizzabile solo dal <@&" +
    IDs.roles.Director +
    "> in sù.\n\n" +
    "`+case` <a:VC_Arrow:1482706699365257397> Con questo si può controllare dettagliatamente un caso di moderazione e capire quando, da chi e perchè è stato fatto.\n\n" +
    "`+moderations` <a:VC_Arrow:1482706699365257397> Serve per mostrare le sanzioni **temporanee** attive su un utente.\n\n" +
    "`+warnings` <a:VC_Arrow:1482706699365257397> Mostra tutti i **warn** ottenuti da un utente.\n\n" +
    "`+clearwarn`, `+delwarn`, `+unmute` e `+unban` <a:VC_Arrow:1482706699365257397> Usati solo per rimuovere rispettivamente un warn (o tutti i warn col primo), un mute e un ban. Utilizzabili solo da <@&" +
    IDs.roles.Director +
    "> in sù.\n\n" +
    "## <a:VC_Alert:1482706673176150077> Prendi tempo per sanzionare!\n" +
    "È meglio una sanzione legittima con una motivazione corretta e una tempistica giusta rispetto a un utente che si lamenta dello staff del server!\n\n" +
    `<a:VC_Exclamation:1482534702077444217> Ricordo di seguire anche le linee guida su come sanzionare correttamente nella sezione **Regolamento**: ${siteWorkflowUrl("guida")}`,

  valutazioni: () =>
    "<a:1370everythingisstable:1444006799643508778> **__VALUTAZIONI POSITIVE__**\n\n" +
    "<a:questionexclaimanimated:1443660299994533960> Le **valutazioni positive** aumentano la possibilità di essere **pexati** e si possono **ottenere** generando un'__attività__ **superiore** a quella richiesta nei _limiti settimanali_ o facendo qualcosa per dare un **vantaggio** al __server__.\n\n" +
    "> Le **valutazioni positive** si possono **__scambiare__** per dei giorni in più di **pausa**.\n\n" +
    "<a:laydowntorest:1444006796661358673> **__VALUTAZIONI NEGATIVE__**\n\n" +
    "<a:questionexclaimanimated:1443660299994533960> Le **valutazioni negative** diminuiscono la possibilità di essere **pexati** e si ottengono **non completando** i _limiti settimanali_ o facendo qualcosa di _nocivo_ per il **server**.\n\n" +
    "> Le **valutazioni negative** possono essere **__rimosse__** completando compiti extra assegnati dall'<@&1442568894349840435> o rinunciando ad almeno `3 o più valutazioni positive` in base al motivo per cui è stata assegnata la valutazione.\n\n" +
    "<a:VC_NewsExclamation:1471891662786527253> **__VALUTAZIONI AUTOMATICHE__**\n\n" +
    "> Ogni settimana si possono ottenere delle **valutazioni automatiche** in base a tre fattori:\n" +
    "<:VC_1:1482706338021642333> **Completamento dei limiti settimanali superandoli __almeno del doppio__**\n" +
    "<:VC_2:1482706376525611090> **Completamento dei compiti extra o settimanali**\n" +
    "<:VC_3:1482706404773990460> **Completamento dei limiti sanzioni**\n\n" +
    "> Inoltre si possono ottenere delle valutazioni extra in base a alcuni ruoli:\n" +
    "<:VC_1:1482706338021642333> **Mettendo il link vanity o il sito nello status o nella bio, o mettendo una nostra GUILD TAGS**\n" +
    "<:VC_2:1482706376525611090> **Seguendo le pagine social**\n" +
    "<:VC_3:1482706404773990460> **Mettendo una recensione sul [nostro sito](https://www.viniliecaffe.it/recensioni)**\n" +
    `<:VC_4:1482706432347344916> **Boostando il server o comprando un ruolo come Donator, VIP o VIP+** \n(<:VC_Attention:1482534443632558151> __Attenzione: per i boost varrà anche solo con un boost, se viene trasferito verrà rimossa anche la valutazione.__ Solo per i ruoli Supporter e Follower bisogna aprire un ticket **Perks** sul sito: ${siteWorkflowUrl("tickets")})**\n\n` +
    "> L'<@&" +
    IDs.roles.HighStaff +
    "> può inoltre decidere di assegnare valutazioni extra a discrezione in base a comportamenti particolarmente virtuosi o dannosi per la community.",

  pex: () =>
    "<a:VC_LevelUp:1482527020641419415> **__GUIDA PEX__**\n\n" +
    "> <:VC_Clock:1473359204189474886> Ogni ruolo, per essere assegnato, richiede un certo tempo per essere ottenuto, ma non è detto che al raggiungimento di questo tempo venga assegnato il ruolo.\n" +
    "<:VC_Dot:1482532364222595303> Il ruolo <@&" +
    IDs.roles.Helper +
    "> è un ruolo di prova, **con un periodo variabile di 1-2 settimane**.\n" +
    "<:VC_Dot:1482532364222595303> Il ruolo <@&" +
    IDs.roles.Mod +
    "> **richiede un periodo variabile di 1-2 mesi**.\n" +
    "<:VC_Dot:1482532364222595303> Il ruolo <@&" +
    IDs.roles.SeniorModerator +
    "> **richiede un periodo variabile di 2-3 mesi**.\n" +
    "<:VC_Dot:1482532364222595303> Il ruolo <@&" +
    IDs.roles.Director +
    "> **richiede un periodo variabile di 3-4 mesi**, essendo esso un ruolo di prova per entrare a tutti gli effetti nell'<@&" +
    IDs.roles.HighStaff +
    ">.\n\n" +
    "> <:VC_Attention:1482534443632558151> Il **pex** viene assegnato quando uno staffer dimostra __costanza__, **qualità** nel lavoro e un comportamento utile alla community.\n" +
    "<:VC_1:1482706338021642333> **Limiti settimanali** completati con continuità.\n" +
    "<:VC_2:1482706376525611090> **Presenza vocale** reale e utile, soprattutto nelle vocali pubbliche.\n" +
    "<:VC_3:1482706404773990460> **Moderazione corretta**, con prove, articoli giusti e buon criterio.\n" +
    "<:VC_4:1482706432347344916> **Valutazioni positive** e contributi extra al server.\n" +
    "<:VC_5:1482706459765637272> **Comportamento maturo**, nessun abuso di potere e rispetto della guida staff.\n\n",

  warnstaff: () =>
    "<:banhammer:1443651875441217639> I **warn staff** vengono __assegnati__ dopo **3 valutazioni negative**. Raggiunti i `2` **warn staff** si verrà depexati al ruolo precedente. **__(Per i Mod sarà depex completo)__**\n\n" +
    "> L'<@&1442568894349840435> può decidere di graziare qualcuno al secondo warn, ma in caso di **terzo warn** lo staffer verrà depexato **__completamente__**\n\n" +
    "<:VC_Attention:1482534443632558151> I **warn staff** non possono essere __rimossi__. Il **reset** dei __warn staff__ avviene ogni **__6 mesi__**.",

  guidapartners: () => {
    const pmCmdChannelId = String(IDs.channels.staffCmds || "").trim();
    return (
      "<:VC_PartnerManager:1494286911286808576> **__GUIDA PARTNERS__**\n\n" +
      "> <:VC_Attention:1482534443632558151> In caso di **infrazione** del _regolamento_ verrà **rimosso** il `punto` della __partner__. Ogni **__`Partner Manager`__** ha _diritto_ a `1` mese e `15` giorni di **pausa** __ogni__ anno.\n" +
      `> <a:VC_Alert:1482706673176150077> Per richiedere una pausa apri la pagina sul **sito**: ${siteWorkflowUrl("pause")}\n` +
      "<:VC_DoubleReply:1482532332509466797> **Non** fare la stessa __partnership__ più di una volta al **giorno**;\n" +
      "<:VC_DoubleReply:1482532332509466797> **Non** fare __partnership__ con se stessi più di una volta al **giorno**;\n" +
      "<:VC_DoubleReply:1482532332509466797> **Non** mettere più di __`5` partnership__ con lo stesso **utente**;\n" +
      "<:VC_DoubleReply:1482532332509466797> **Non** mettere partner con link **scaduti**;\n" +
      "<:VC_DoubleReply:1482532332509466797> Il **numero minimo** di __partnership__ da __fare__ in una settimana è __`30`__;\n" +
      "<:VC_Reply:1482532158080942191> È **vietato** fare __partnership__ con qualsiasi tipo di __server__ `NSFW` o che violi i `ToS` di **Discord**.\n\n" +
      "<a:VC_Exclamation:1482534702077444217> **Comandi e ticket:**\n" +
      (pmCmdChannelId
        ? `> \`/partnership\` - Utilizzabile in <#${pmCmdChannelId}> (thread comandi PM) o dal pannello comandi nei **ticket Partnership** sul sito\n`
        : "> `/partnership` - Utilizzabile dal pannello comandi nei **ticket Partnership** sul sito\n") +
      "> `+desc` / comandi partnership - nei **ticket Partnership** sul sito (pannello comandi del ticket)\n" +
      `> Ticket staff: ${siteWorkflowUrl("ticketsStaff")}\n` +
      "> `+classifica` - Per vedere la classifica punti partner settimanale e totale\n" +
      "> `+blacklist` - Per vedere i server in blacklist\n" +
      `> Profilo / shop PM: sul **sito staff** → ${siteWorkflowUrl("staff")}\n` +
      `> Punti tolti: ${siteWorkflowUrl("puntiTolti")}\n\n` +
      "<a:VC_Exclamation:1482534702077444217> **Info utili:**\n" +
      "> <a:VC_Cross:1482532424570376253> **Non ci sono requisiti per le partner**\n" +
      "> <a:VC_Verified:1482532479637127188> **Il manager deve aver completato l'inserimento o non si può fare la partner.**\n" +
      "> <a:VC_PepeExit:1446190735937245415> **Il manager non deve uscire dal server o la partner verrà cancellata.**\n" +
      `> <:VC_Collab:1482534540089098260> **I ticket partnership si gestiscono sul sito (${siteWorkflowUrl("ticketsStaff")}): fatevi inviare la descrizione e usate i comandi direttamente lì.**`
    );
  },

  guidamiddle: () =>
    `<:discordstaff:1443651872258003005> La **__guida middle__** di __Vinili & Caffè__ è dedicata a <@&${IDs.roles.SeniorModerator}> e <@&${IDs.roles.Director}>: qui trovate le procedure per i compiti di livello superiore che richiedono coordinamento e supervisione del low staff.

> La guida si divide in **__\`4\` sezioni__**:
<:VC_1:1482706338021642333> **Gestione Ticket**
<:VC_2:1482706376525611090> **Gestione Verifica Selfie**
<:VC_3:1482706404773990460> **Gestione Follower & Supporter**
<:VC_4:1482706432347344916> **Gestione Partnership**`,

  middle_ticket: () =>
    `<:VC_Ticket:1482535175283019888> I ticket si gestiscono sul **sito**: ${siteWorkflowUrl("ticketsStaff")}. Essendo un ruolo superiore non vi è richiesto di rispondere subito a tutti: date supporto al low staff e intervenite quando serve.\n\n` +
    "<a:VC_pixeltime:1482535344103620771> Se un ticket rimarrà **non claimato** per più di **5 minuti** allora **dovete** claimarlo e gestirlo voi.",

  middle_selfie: () =>
    `<:VC_Ticket:1482535175283019888> I ticket **Perks** (verifica selfie) sono sul sito: ${siteWorkflowUrl("ticketsStaff")}. Da lì gestite i ruoli <@&` +
    IDs.roles.Verificato +
    "> / <@&" +
    IDs.roles.VerifiedNeo +
    "> / <@&" +
    IDs.roles.Verificata +
    ">.\n\n" +
    "<a:VC_Alert:1482706673176150077> Quando un utente apre un ticket Perks per la verifica selfie controllate i passaggi richiesti; se siete <@&" +
    IDs.roles.SeniorModerator +
    "> taggate un <@&" +
    IDs.roles.Director +
    "> oppure, da <@&" +
    IDs.roles.Director +
    ">, assegnate direttamente il ruolo.\n" +
    "> PS: Occhio a dare ruoli sbagliati, il bot potrebbe bannarvi <:VC_Eye:1331619214410383381>",

  middle_follower: () =>
    "<a:VC_Calendar:1482706208149475358> Ogni settimana vi dovrete organizzare per decidere chi deve controllare queste due liste.\n\n" +
    "<a:VC_Verified:1482532479637127188> Per controllare le liste dovrete usare [questo documento](<https://docs.google.com/spreadsheets/d/1rsyOqlveEraSv2YeSCY9Qg_xF3Rn6bqLj6G3-FI4Zu0/edit?usp=sharing>) chiedendo l'accesso a <@295500038401163264>.\n\n" +
    "<:VC_Quest:1482534879257165865> Ognuno di voi può controllare al **massimo 1 lista** a settimana. Ogni sabato uno di voi comunica l'assegnazione (in staff chat / news) così:\n\n" +
    "```\n@staffer -> lista che controlla\n@staff -> lista che controlla\n```\n\n" +
    `<:VC_Ticket:1482535175283019888> I ticket **Perks** per <@&${IDs.roles.Follower}> e <@&${IDs.roles.SocialSupporter}> sono sul sito: ${siteWorkflowUrl("ticketsStaff")}. Controllate le prove e, se siete <@&` +
    IDs.roles.SeniorModerator +
    "> , chiamate un <@&" +
    IDs.roles.Director +
    "> per assegnare il ruolo.\n" +
    "> PS: Gentilmente, ogni volta che viene dato anche questo ruolo aggiornate le liste <a:VC_Alarm:1482706641618079816>\n\n" +
    "<a:VC_Alert:1482706673176150077> Naturalmente, fare questo compito vi garantirà una **valutazione positiva**, non presentare la lista dei compiti il sabato o non fare il compito che vi siete assegnati comporterà a una **valutazione negativa**.",

  middle_partnership: () =>
    "<a:VC_Calendar:1482706208149475358> Ogni settimana un <@&" +
    IDs.roles.Director +
    "> dovrà controllare tutte le <#" +
    IDs.channels.partnerships +
    "> e assicurarsi che rispettino la guida partners\n\n" +
    "<:VC_Quest:1482534879257165865> Qualsiasi partner che non rispetta quelle regole dovrà essere reportata qua settimanalmente tramite un semplice modulo\n\n" +
    "```\nlink messaggio -> regola infranta -> @partner manager\n```\n\n" +
    "<:VC_Attention:1482534443632558151> Molte regole sono già coperte da <@" +
    IDs.bots.ViniliCaffeBot +
    "> e prima di segnalare una partner controlla la pagina **Punti tolti PM** sul sito staff per capire se il bot ha già tolto il punto o meno.",

  generalimoderazione: () => `<:rules:1443307208543703131> **__Regola \`1.1\`__**
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
${staffSanctionRuleIntro("1.5")}                <:VC_Reply:1482532158080942191> Sanzione: **Ban**`,

  testualimoderazione: () => `<:rules:1443307208543703131> **__Regola \`2.1\`__**
${staffSanctionRuleIntro("2.1")}                <:VC_DoubleReply:1482532332509466797> 1° Sanzione: **Mute __24h__**
                <:VC_Reply:1482532158080942191> 2° Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`2.2\`__**
${staffSanctionRuleIntro("2.2")}                <:VC_Reply:1482532158080942191> Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`2.3\`__**
${staffSanctionRuleIntro("2.3")}                <:VC_DoubleReply:1482532332509466797> 1° Sanzione: **Mute __3h__**
                <:VC_Reply:1482532158080942191> 2° Sanzione: **Mute __6h__**

                <:rules:1443307208543703131> **__Regola \`2.4\`__**
${staffSanctionRuleIntro("2.4")}                <:VC_DoubleReply:1482532332509466797> 1° Sanzione: **Warn**
                <:VC_Reply:1482532158080942191> 2° Sanzione: **Mute __2h__**`,

  vocalimoderazione: () => `<:rules:1443307208543703131> **__Regola \`3.1\`__**
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
                <:VC_Reply:1482532158080942191> 3° Sanzione: **Mute __24h__**`,
};

function buildStaffGuideSectionMarkdown(sectionId) {
  const id = String(sectionId || "").trim();
  const builder = SECTION_BUILDERS[id];
  if (!builder) return null;
  return builder();
}

module.exports = {
  staffSanctionRuleIntro,
  listStaffGuideSectionMeta,
  getStaffGuideSectionMeta,
  getStaffGuideChildSectionIds,
  buildStaffGuideIntroMarkdown,
  buildStaffGuideSectionMarkdown,
};
