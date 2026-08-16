/**
 * Unlink Hogwarts house / event roles wrongly stored as profile.customRole.
 * Also reports previous custom roles from staff_restore_20260716 when available.
 *
 * Usage: node Vinyls/Scripts/unlinkHogwartsHouseCustomRoles.js [--apply]
 */
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

function loadEnv() {
  const file = ["/opt/bot/.env", path.resolve(__dirname, "../../.env")].find((p) => fs.existsSync(p));
  if (!file) throw new Error("missing .env");
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

function loadHouseRoleIds() {
  const cfgPath = path.resolve(__dirname, "../config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const houses = cfg?.hogwartsEvent?.houses || {};
  const ids = new Set();
  for (const h of Object.values(houses)) {
    const id = String(h?.roleId || "").trim();
    if (/^\d{17,22}$/.test(id)) ids.add(id);
  }
  const completion = String(cfg?.hogwartsEvent?.completionRoleId || "1507000390493798511").trim();
  if (/^\d{17,22}$/.test(completion)) ids.add(completion);
  // Known Discord names if config drifts
  for (const id of [
    "1504791825657888898",
    "1504791921246339072",
    "1504791899100155987",
    "1504791872671973537",
    "1507000390493798511",
  ]) {
    ids.add(id);
  }
  return ids;
}

const env = loadEnv();
const APPLY = process.argv.includes("--apply");
const gid = "1329080093599076474";
const HOUSE_IDS = loadHouseRoleIds();

(async () => {
  const mongo = new MongoClient(env.MONGO_URL_LOCAL);
  await mongo.connect();
  const live = mongo.db("test").collection("activityuserprofiles");
  const restore = mongo.db("staff_restore_20260716").collection("activityuserprofiles");

  const docs = await live
    .find(
      {
        guildId: gid,
        $or: [
          { "profile.customRole.roleId": { $in: [...HOUSE_IDS] } },
          { "profile.customRole.secondaryRoleId": { $in: [...HOUSE_IDS] } },
        ],
      },
      { projection: { userId: 1, "profile.customRole": 1 } },
    )
    .toArray();

  const report = [];
  for (const doc of docs) {
    const userId = String(doc.userId || "");
    const cr = doc.profile?.customRole || {};
    const primary = String(cr.roleId || "").trim();
    const secondary = String(cr.secondaryRoleId || "").trim();
    const nextPrimary = HOUSE_IDS.has(primary) ? null : primary || null;
    const nextSecondary = HOUSE_IDS.has(secondary) ? null : secondary || null;

    // Prefer restoring a previous real custom role if house hijacked the slot
    const bak = await restore.findOne(
      { guildId: gid, userId },
      { projection: { "profile.customRole.roleId": 1, "profile.customRole.secondaryRoleId": 1 } },
    );
    const bakPrimary = String(bak?.profile?.customRole?.roleId || "").trim();
    const bakSecondary = String(bak?.profile?.customRole?.secondaryRoleId || "").trim();
    let restorePrimary = nextPrimary;
    let restoreSecondary = nextSecondary;
    if (!restorePrimary && bakPrimary && !HOUSE_IDS.has(bakPrimary)) restorePrimary = bakPrimary;
    if (!restoreSecondary && bakSecondary && !HOUSE_IDS.has(bakSecondary)) restoreSecondary = bakSecondary;

    report.push({
      userId,
      before: { roleId: primary || null, secondaryRoleId: secondary || null },
      after: { roleId: restorePrimary, secondaryRoleId: restoreSecondary },
      fromBackup: Boolean((!nextPrimary && restorePrimary) || (!nextSecondary && restoreSecondary && restoreSecondary !== nextSecondary)),
    });

    if (APPLY) {
      await live.updateOne(
        { guildId: gid, userId },
        {
          $set: {
            "profile.customRole.roleId": restorePrimary,
            "profile.customRole.secondaryRoleId": restoreSecondary,
          },
        },
      );
    }
  }

  console.log(JSON.stringify({ apply: APPLY, houseIds: [...HOUSE_IDS], fixed: report.length, report }, null, 2));
  await mongo.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
