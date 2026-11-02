const path = require("node:path") as typeof import("node:path");

const VINILI_ROOT = path.resolve(__dirname, "..");

function viniliPath(...parts: string[]) {
  return path.join(VINILI_ROOT, ...parts);
}

export = { VINILI_ROOT, viniliPath };
