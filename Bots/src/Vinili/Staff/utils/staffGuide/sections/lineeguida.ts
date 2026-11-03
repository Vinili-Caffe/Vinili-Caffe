const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");

const build_lineeguida = () =>
    "Per avere un server attivo bisogna prima di tutto avere un legame con la community. Ecco alcuni consigli per instaurare dei discorsi con i nuovi utenti ma anche con quelli anziani.\n\n" +
    "> ### Presentarsi è sempre una buona base!\n" +
    "Nel momento in cui un utente approda nel server, è buona prassi far capire cosa può fare qui con noi. Quando si unisce sa già che come topic abbiamo il chatting quindi si deve puntare a quella che si chiama **profilazione** ovvero la raccolta di dati dell'utente. Per farlo, abbiamo realizzato diversi ruoli che l'utente può prendere. Tutto questo è già possibile con l'inserimento ma, nel caso volesse cambiarli o aggiungerli (cosa su cui dovreste spingere), invece di usare il semplice \"wlc\" potete tranquillamente dire:\n" +
    `benvenutx @tag_utente! passa in <#${IDs.channels.commands}> e https://www.viniliecaffe.it/personalizza per prenderti i colori e tanti altri ruoli <3\n\n` +
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
    "Per portare avanti un progetto, renderlo bello e arricchirlo personalmente sono necessari davvero pochi e piccoli passi. Seguiteli e vedrete che andrà tutto bene! **E ricordati di divertirti!**";

export = {
  lineeguida: build_lineeguida,
};
