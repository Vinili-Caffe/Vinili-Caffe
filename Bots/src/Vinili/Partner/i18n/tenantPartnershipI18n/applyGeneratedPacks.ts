const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { TENANT_LANGUAGES, DEFAULT_LANGUAGE } = require("./languages") as typeof import("./languages");

const GEN_DIR = path.join(__dirname, "generated");

function readJson(filePath?) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function applyGeneratedPacks(uiPacks?, badgeCopy?, objectiveCopy?) {
  if (process.env.VC_SKIP_GENERATED_I18N === "1") return;
  const itUi = uiPacks[DEFAULT_LANGUAGE] || uiPacks.it || {};
  const itBadges = badgeCopy[DEFAULT_LANGUAGE] || badgeCopy.it || {};
  const itObjectives = objectiveCopy[DEFAULT_LANGUAGE] || objectiveCopy.it || {};

  for (const code of TENANT_LANGUAGES) {
    if (code === DEFAULT_LANGUAGE) continue;

    const uiGen = readJson(path.join(GEN_DIR, "ui", `${code}.json`));
    if (uiGen && typeof uiGen === "object") {
      uiPacks[code] = { ...itUi, ...uiGen };
    } else if (!uiPacks[code]) {
      uiPacks[code] = { ...itUi };
    }

    const badgeGen = readJson(path.join(GEN_DIR, "badges", `${code}.json`));
    if (badgeGen && typeof badgeGen === "object") {
      badgeCopy[code] = badgeGen;
    } else if (!badgeCopy[code]) {
      badgeCopy[code] = { ...itBadges };
    }

    const objGen = readJson(path.join(GEN_DIR, "objectives", `${code}.json`));
    if (objGen && typeof objGen === "object") {
      objectiveCopy[code] = objGen;
    } else if (!objectiveCopy[code]) {
      objectiveCopy[code] = { ...itObjectives };
    }
  }
}

export = { applyGeneratedPacks };
