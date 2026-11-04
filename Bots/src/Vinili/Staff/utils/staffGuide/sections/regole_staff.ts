const { E } = require("../../../../../shared/emojis/emojiCatalog") as typeof import("../../../../../shared/emojis/emojiCatalog");
const build_regole_staff = () =>
    `${E.VC_1} **Rispettare** le regole del server.\n` +
    `${E.VC_2} __Non__ **chiedere** pex _continuamente_.\n` +
    `${E.VC_3} __Non__ **istigare** o creare **flame** tra lo **\`staff\`** e gli **\`utenti\`**.\n` +
    `${E.VC_4} __Non__ **abusare** di potere, ad esempio **sanzionando** un __utente__ \`senza un vero motivo\`.\n` +
    `${E.VC_5} Se si è in una **vocale pubblica** da __mutati__ siete **obbligati** a scrivere in <#1442569130573303898>.\n` +
    `${E.VC_6} __Non__ **floodare**, **spammare** e **usare bot** per completare i **\`limiti settimanali testuali\`**.\n` +
    `${E.VC_7} __Non__ passare la maggior parte del **tempo** nei **canali vocali privati**, poiché non vengono **conteggiati** al fine dei __limiti settimanali__.\n` +
    `${E.VC_8} __Non__ **stare da soli** in una __vocale pubblica__ se in un'altra vi è già un altro **staffer** da solo. Inoltre, almeno uno dei due **deve** essere __smutato__.\n` +
    `> ${E.VC_Alert} La violazione di una di queste regole può comportare una **sanzione** da parte dello staff, quindi è importante __conoscerle__ e __rispettarle__.`;

export = {
  regole_staff: build_regole_staff,
};
