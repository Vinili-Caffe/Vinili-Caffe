// @ts-nocheck
/* Shim: i canvas economia usavano formatGaleoni (Hogwarts).
   Durante SW l'economia Discord usa crediti evento. */
const hogwarts = require("../../../../../hogwarts/src/Vinili/Services/Community/gringottService");
const {
  formatCreditsPlain,
  formatCreditsShort,
  formatCreditsDiscord,
  CREDITI_EMOJI,
} = require("./starWarsCreditsBridge") as typeof import("./starWarsCreditsBridge");

function formatGaleoni(amount?) {
  return formatCreditsPlain(amount);
}

export = {
  ...hogwarts,
  CREDITI_EMOJI,
  formatCreditsDiscord,
  formatCreditsPlain,
  formatCreditsShort,
  formatGaleoni,
};
