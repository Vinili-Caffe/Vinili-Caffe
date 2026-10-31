/**
 * Cartella del bot Vinili (dentro: Data, Commands, logs, local_transcripts…).
 * I percorsi si calcolano da qui e non dal file che li usa: spostare un file non li rompe.
 */
const path = require("node:path") as typeof import("node:path");

const VINILI_ROOT = path.resolve(__dirname, "..");

function viniliPath(...parts: string[]) {
  return path.join(VINILI_ROOT, ...parts);
}

export = { VINILI_ROOT, viniliPath };
