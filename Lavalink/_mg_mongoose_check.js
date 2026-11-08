process.chdir("/opt/bot");
process.env.NODE_PATH = "/opt/bot/bots-ts/node_modules:/opt/bot/node_modules";
require("module").Module._initPaths();

const mFromReq = require("mongoose");
const mAbsBot = require("/opt/bot/bots-ts/node_modules/mongoose");
const mAbsRoot = require("/opt/bot/node_modules/mongoose");
const schemas = require("/opt/bot/bots-ts/src/Vinili/Community/schemas/communitySchemas.js");
const activityRows = require("/opt/bot/bots-ts/src/Vinili/Community/services/activityRows.js");

console.log(
  JSON.stringify(
    {
      sameReqAbsBot: mFromReq === mAbsBot,
      sameReqAbsRoot: mFromReq === mAbsRoot,
      sameAbs: mAbsBot === mAbsRoot,
      modelMongoose: schemas.ActivityUserProfile?.base === mFromReq || schemas.ActivityUserProfile?.db?.base === mFromReq,
      readyBefore: mFromReq.connection.readyState,
      modelReadyBefore: schemas.ActivityGuildHourly?.db?.readyState,
    },
    null,
    2,
  ),
);
