/** Facade: valutazione pos/neg add/remove panel actions. */
const {
  ensureStaffProfileDoc,
  getStaffDoc,
  makeRemovalEmbed,
  makeLogEmbed,
} = require("./valutazionePanel/shared") as typeof import("./valutazionePanel/shared");
const {
  consumeOldestNegativesFromStaff,
  removeOldestPositiveValutazioni,
} = require("./valutazionePanel/trades") as typeof import("./valutazionePanel/trades");
const {
  valutazionePositiveAddCore,
  valutazioneNegativeAddCore,
  valutazionePositiveRemoveCore,
} = require("./valutazionePanel/cores") as typeof import("./valutazionePanel/cores");
const {
  runValutazionePositiveAddForPanel,
  runValutazioneNegativeAddForPanel,
  runValutazionePositiveRemoveForPanel,
  runValutazioneNegativeRemoveForPanel,
  runValutazioneNegTradeForPanel,
  runValutazionePosPauseTradeForPanel,
} = require("./valutazionePanel/panel") as typeof import("./valutazionePanel/panel");

export = {
  ensureStaffProfileDoc,
  getStaffDoc,
  valutazionePositiveAddCore,
  valutazioneNegativeAddCore,
  valutazionePositiveRemoveCore,
  makeRemovalEmbed,
  makeLogEmbed,
  consumeOldestNegativesFromStaff,
  removeOldestPositiveValutazioni,
  runValutazionePositiveAddForPanel,
  runValutazioneNegativeAddForPanel,
  runValutazionePositiveRemoveForPanel,
  runValutazioneNegativeRemoveForPanel,
  runValutazioneNegTradeForPanel,
  runValutazionePosPauseTradeForPanel,
};
