const { E } = require("../../../../../shared/emojis/emojiCatalog") as typeof import("../../../../../shared/emojis/emojiCatalog");
const build_warnstaff = () =>
    `${E.banhammer} I **warn staff** vengono __assegnati__ dopo **3 valutazioni negative**. Raggiunti i \`2\` **warn staff** si verrà depexati al ruolo precedente. **__(Per i Mod sarà depex completo)__**\n` +
    "> L'<@&1544831228690046976> può decidere di graziare qualcuno al secondo warn, ma in caso di **terzo warn** lo staffer verrà depexato **__completamente__**\n" +
    `${E.VC_Attention} I **warn staff** non possono essere __rimossi__. Il **reset** dei __warn staff__ avviene ogni **__6 mesi__**.`;

export = {
  warnstaff: build_warnstaff,
};
