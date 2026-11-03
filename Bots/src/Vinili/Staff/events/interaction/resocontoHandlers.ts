/** Facade: resoconto Discord + web handlers. */
const {
  RESOCONTO_APPLY_PREFIX,
  RESOCONTO_REJECT_PREFIX,
  applyDepexSideEffects,
  sendPexDepexLog,
} = require("./resoconto/sideEffects") as typeof import("./resoconto/sideEffects");
const { decideResocontoFromWeb } = require("./resoconto/webDecide") as typeof import("./resoconto/webDecide");

export = {
  RESOCONTO_APPLY_PREFIX,
  RESOCONTO_REJECT_PREFIX,
  applyDepexSideEffects,
  sendPexDepexLog,
  decideResocontoFromWeb,
};
